import { config } from "./config";
import { logger } from "./logger";
import type { JobPayload, TranscodeResult } from "./types";

const WORKER_SECRET_HEADER = "x-worker-secret";
const JOB_SECRET_HEADER = "x-job-secret";

function assertCallbackConfig(): void {
  const missing: string[] = [];
  if (!config.workerCallbackUrl) missing.push("WORKER_CALLBACK_URL");
  if (!config.workerSecret) missing.push("WORKER_SECRET");

  if (missing.length > 0) {
    throw new Error(`Missing required callback environment variables: ${missing.join(", ")}`);
  }
}

export async function sendWorkerCallback(
  payload: JobPayload,
  result: TranscodeResult,
): Promise<void> {
  assertCallbackConfig();

  const status = result.success ? "ready" : "failed";
  const body = {
    id: result.id,
    status,
    outputDir: result.outputDir,
    masterPlaylist: result.masterPlaylist,
    durationSeconds: result.durationSeconds,
    error: result.error,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(config.workerCallbackUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [WORKER_SECRET_HEADER]: config.workerSecret,
        [JOB_SECRET_HEADER]: payload.jobSecret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const responseText = await res.text();
      throw new Error(
        `Worker callback failed with ${res.status}: ${responseText || "empty response body"}`,
      );
    }

    logger.info("Worker callback sent", { id: result.id, status, callbackUrl: config.workerCallbackUrl });
  } finally {
    clearTimeout(timeout);
  }
}
