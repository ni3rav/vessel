export interface WorkerConfig {
  outputDir: string;
  tempDir: string;
  ffmpegPath: string;
  ffprobePath: string;
  hlsSegmentDuration: number;
  logLevel: "debug" | "info" | "warn" | "error";
  bitratesKbps: readonly number[];
  sourceBaseUrl: string;
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
  sourceBaseUrl: process.env["SOURCE_BASE_URL"] ?? "",
};
