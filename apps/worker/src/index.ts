import "dotenv/config";
import { killActiveProcesses } from "./ffmpeg";
import { logger } from "./logger";
import { processJob } from "./job";
import type { JobPayload } from "./types";

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn("Shutdown signal received", { signal });
  killActiveProcesses();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk: string) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data.trim()));
    process.stdin.on("error", reject);
  });
}

async function main(): Promise<void> {
  logger.info("Worker starting");

  let raw: string;

  // Accept payload from stdin or JOB_PAYLOAD env var
  if (process.env["JOB_PAYLOAD"]) {
    raw = process.env["JOB_PAYLOAD"];
  } else {
    raw = await readStdin();
  }

  if (!raw) {
    logger.error("No job payload provided (stdin or JOB_PAYLOAD env var)");
    process.exit(1);
  }

  let payload: JobPayload;
  try {
    payload = JSON.parse(raw) as JobPayload;
  } catch {
    logger.error("Invalid JSON in job payload");
    process.exit(1);
    return;
  }

  if (!payload.id || !payload.key || !payload.filename || !payload.userid) {
    logger.error("Job payload missing required fields: id, key, filename, userid");
    process.exit(1);
    return;
  }

  if (shuttingDown) {
    logger.warn("Shutdown already in progress, skipping job");
    process.exit(0);
    return;
  }

  const result = await processJob(payload);

  // Write structured result to stdout as a single JSON line
  process.stdout.write(JSON.stringify(result) + "\n");

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  logger.error("Unhandled error in worker", { error: String(err) });
  process.exit(1);
});
