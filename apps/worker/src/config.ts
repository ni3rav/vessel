export interface WorkerConfig {
  outputDir: string;
  tempDir: string;
  ffmpegPath: string;
  ffprobePath: string;
  hlsSegmentDuration: number;
  logLevel: "debug" | "info" | "warn" | "error";
  bitratesKbps: readonly number[];
  r2AccountId: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2Bucket: string;
  r2PublicBaseUrl: string;
  workerCallbackUrl: string;
  workerSecret: string;
}

function parseLogLevel(value: string | undefined): WorkerConfig["logLevel"] {
  const levels = ["debug", "info", "warn", "error"] as const;
  const normalized = (value ?? "info").toLowerCase();
  return levels.includes(normalized as WorkerConfig["logLevel"])
    ? (normalized as WorkerConfig["logLevel"])
    : "info";
}

export const config: WorkerConfig = {
  outputDir: process.env["OUTPUT_DIR"] ?? "/data/output",
  tempDir: process.env["TEMP_DIR"] ?? "/data/temp",
  ffmpegPath: process.env["FFMPEG_PATH"] ?? "ffmpeg",
  ffprobePath: process.env["FFPROBE_PATH"] ?? "ffprobe",
  hlsSegmentDuration: parseInt(process.env["HLS_SEGMENT_DURATION"] ?? "6", 10),
  logLevel: parseLogLevel(process.env["LOG_LEVEL"]),
  bitratesKbps: [64, 128, 192, 256] as const,
  r2AccountId: process.env["R2_ACCOUNT_ID"] ?? "",
  r2AccessKeyId: process.env["R2_ACCESS_KEY_ID"] ?? "",
  r2SecretAccessKey: process.env["R2_SECRET_ACCESS_KEY"] ?? "",
  r2Bucket: process.env["R2_BUCKET"] ?? "",
  r2PublicBaseUrl:
    process.env["R2_PUBLIC_BASE_URL"] ?? process.env["SOURCE_BASE_URL"] ?? "",
  workerCallbackUrl: process.env["WORKER_CALLBACK_URL"] ?? "",
  workerSecret: process.env["WORKER_SECRET"] ?? "",
};
