import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createR2Client, deleteObjects } from "@vessel/r2";
import cron from "node-cron";
import path from "node:path";
import { Pool } from "pg";

import { env } from "./env";

type UploadRow = {
  id: string;
  key: string;
  status: "failed" | "processing";
  createdAt: Date | string;
};

type CleanupSummary = {
  scanned: number;
  deletedDb: number;
  deletedR2: number;
  failedItems: number;
};

const pool = new Pool({ connectionString: env.DATABASE_URL });
const r2 = createR2Client({
  accountId: env.R2_ACCOUNT_ID,
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
});

function deriveOutputPrefixFromSourceKey(sourceKey: string): string {
  const key = sourceKey.replace(/^\//, "").replace(/\\/g, "/");
  const ext = path.posix.extname(key);
  const stem = path.posix.basename(key, ext);
  const dir = path.posix.dirname(key);

  if (!stem) {
    throw new Error(`Invalid source key (no basename): ${sourceKey}`);
  }
  if (dir === ".") return stem;

  const parentLeaf = path.posix.basename(dir);
  if (parentLeaf === stem) return dir;

  return path.posix.join(dir, stem);
}

async function listKeysUnderPrefix(prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await r2.send(
      new ListObjectsV2Command({
        Bucket: env.R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    const chunk = (response.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key));
    keys.push(...chunk);
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function deleteUploadArtifacts(row: UploadRow): Promise<number> {
  const outputPrefix = deriveOutputPrefixFromSourceKey(row.key).replace(/^\/+/, "");
  const listedKeys = await listKeysUnderPrefix(`${outputPrefix}/`);
  const keys = Array.from(new Set([row.key.replace(/^\/+/, ""), ...listedKeys]));

  if (keys.length === 0) {
    return 0;
  }

  if (env.DRY_RUN) {
    console.info("[cron.cleanup] DRY_RUN enabled, skipping R2 deletion", {
      uploadId: row.id,
      status: row.status,
      keysCount: keys.length,
    });
    return keys.length;
  }

  const result = await deleteObjects(r2, {
    bucket: env.R2_BUCKET,
    keys,
  });

  if (result.failedKeys.length > 0) {
    throw new Error(
      `R2 delete failed for ${result.failedKeys.length} keys: ${result.failedKeys
        .map((item) => `${item.key} (${item.error})`)
        .join(", ")}`,
    );
  }

  return result.deletedKeys.length;
}

async function selectBatch(skippedIds: string[]): Promise<UploadRow[]> {
  const cutoff = new Date(Date.now() - env.CLEANUP_PROCESSING_TTL_HOURS * 60 * 60 * 1000);
  const result = await pool.query<UploadRow>(
    `
      SELECT
        id,
        key,
        status,
        created_at AS "createdAt"
      FROM uploads
      WHERE
        (status = 'failed' OR (status = 'processing' AND created_at <= $1))
        AND (cardinality($2::text[]) = 0 OR NOT (id = ANY($2::text[])))
      ORDER BY created_at ASC
      LIMIT $3
    `,
    [cutoff.toISOString(), skippedIds, env.CLEANUP_BATCH_SIZE],
  );
  return result.rows;
}

async function runCleanup(): Promise<CleanupSummary> {
  const summary: CleanupSummary = {
    scanned: 0,
    deletedDb: 0,
    deletedR2: 0,
    failedItems: 0,
  };
  const skippedIds: string[] = [];

  while (true) {
    const rows = await selectBatch(skippedIds);
    if (rows.length === 0) break;

    for (const row of rows) {
      summary.scanned += 1;
      try {
        const deletedKeysCount = await deleteUploadArtifacts(row);
        summary.deletedR2 += deletedKeysCount;

        if (env.DRY_RUN) {
          console.info("[cron.cleanup] DRY_RUN enabled, skipping DB row deletion", {
            uploadId: row.id,
            status: row.status,
          });
          continue;
        }

        await pool.query("DELETE FROM uploads WHERE id = $1", [row.id]);
        summary.deletedDb += 1;

        console.info("[cron.cleanup] Cleanup complete", {
          uploadId: row.id,
          status: row.status,
          deletedKeysCount,
        });
      } catch (error) {
        summary.failedItems += 1;
        skippedIds.push(row.id);
        console.error("[cron.cleanup] Cleanup failed", {
          uploadId: row.id,
          status: row.status,
          error: String(error),
        });
      }
    }
  }

  console.info("[cron.cleanup] Run summary", summary);
  return summary;
}

const isDailyMode = process.argv.includes("--daily");

if (isDailyMode) {
  console.info("[cron.cleanup] Scheduler mode enabled", {
    schedule: env.CLEANUP_SCHEDULE_CRON,
    dryRun: env.DRY_RUN,
  });

  cron.schedule(env.CLEANUP_SCHEDULE_CRON, async () => {
    try {
      await runCleanup();
    } catch (error) {
      console.error("[cron.cleanup] Scheduled run crashed", { error: String(error) });
    }
  });
} else {
  runCleanup()
    .then(() => {
      void pool.end();
      process.exit(0);
    })
    .catch((error) => {
      console.error("[cron.cleanup] Run crashed", { error: String(error) });
      void pool.end();
      process.exit(1);
    });
}
