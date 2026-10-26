import { db } from "@/db";
import { uploads } from "@/db/schema";
import { deleteLockedUpload } from "@/lib/cleanup-upload";
import { env } from "@/lib/env";
import { tryCatch } from "@/lib/try-catch";
import { deleteStoredUpload } from "@/lib/upload-storage";
import { createR2Client } from "@vessel/r2";
import { and, eq, lt, or, type SQL, sql } from "drizzle-orm";
import { Elysia } from "elysia";

const r2 = createR2Client({
  accountId: env.R2_ACCOUNT_ID,
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
});

function staleOrFailed(): SQL | undefined {
  // Time comparisons run in Postgres so they use the same clock as created_at.
  const staleUploading = and(
    eq(uploads.status, "uploading"),
    lt(uploads.createdAt, sql`NOW() - INTERVAL '15 minutes'`),
  );
  const staleProcessing = and(
    eq(uploads.status, "processing"),
    lt(uploads.createdAt, sql`NOW() - INTERVAL '1 hour'`),
  );
  return or(staleUploading, staleProcessing, eq(uploads.status, "failed"));
}

export const cronRouter = new Elysia({ prefix: "/cron" }).get(
  "/cleanup-uploads",
  async ({ request, set }) => {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      set.status = 401;
      return "Unauthorized";
    }

    const candidates = await tryCatch(
      db.select({ id: uploads.id }).from(uploads).where(staleOrFailed()),
    );
    if (candidates.error) {
      set.status = 500;
      console.error("[cron.cleanup-uploads] Failed to list uploads", candidates.error);
      return { error: "Failed to cleanup uploads", deleted: 0 };
    }

    const deleted: Array<{ id: string; status: string }> = [];
    const failedIds: string[] = [];

    for (const candidate of candidates.data) {
      const result = await tryCatch(cleanupOne(candidate.id));
      if (result.error) {
        failedIds.push(candidate.id);
        console.error("[cron.cleanup-uploads] Failed to delete upload", {
          uploadId: candidate.id,
          error: result.error,
        });
        continue;
      }
      if (result.data) deleted.push(result.data);
    }

    console.info("[cron.cleanup-uploads] Deleted stale/failed uploads", {
      count: deleted.length,
      ids: deleted,
      failed: failedIds.length,
    });

    if (failedIds.length > 0) {
      set.status = 500;
      return {
        error: "Failed to cleanup uploads",
        deleted: deleted.length,
        failed: failedIds.length,
      };
    }

    return { deleted: deleted.length };
  },
);

async function cleanupOne(id: string): Promise<{ id: string; status: string } | null> {
  return db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: uploads.id, key: uploads.key, status: uploads.status })
      .from(uploads)
      .where(and(eq(uploads.id, id), staleOrFailed()))
      .limit(1)
      .for("update");

    const row = locked[0];
    if (!row) return null;

    await deleteLockedUpload(row, {
      deleteStorage: (key) => deleteStoredUpload(r2, env.R2_BUCKET, key),
      deleteRow: async (uploadId) => {
        const removed = await tx
          .delete(uploads)
          .where(and(eq(uploads.id, uploadId), staleOrFailed()))
          .returning({ id: uploads.id });
        return removed.length;
      },
    });

    return { id: row.id, status: row.status };
  });
}
