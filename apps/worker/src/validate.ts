import { spawnFfprobe } from "./ffmpeg";
import { logger } from "./logger";
import type { FfprobeOutput, ValidationResult } from "./types";

const MIN_DURATION_SECONDS = 0.1;

// mp3 → codec_name "mp3"; wav → pcm_* family (pcm_s16le, pcm_s24le, pcm_f32le, etc.)
const ALLOWED_CODEC_PREFIXES = ["mp3", "pcm_"];

export async function validateAudioFile(filePath: string): Promise<ValidationResult> {
  logger.info("Validating audio file", { filePath });

  let stdout: string;
  try {
    const result = await spawnFfprobe([
      "-v", "error",
      "-show_streams",
      "-show_format",
      "-select_streams", "a:0",
      "-of", "json",
      filePath,
    ]);
    stdout = result.stdout;
  } catch (err) {
    const error = `ffprobe failed: ${String(err)}`;
    logger.error("Validation failed", { error });
    return { valid: false, durationSeconds: 0, error };
  }

  let probe: FfprobeOutput;
  try {
    probe = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    const error = "Failed to parse ffprobe output";
    return { valid: false, durationSeconds: 0, error };
  }

  const audioStream = probe.streams?.find((s) => s.codec_type === "audio");

  if (!audioStream) {
    const error = "No audio stream found in file";
    logger.error("Validation failed", { error });
    return { valid: false, durationSeconds: 0, error };
  }

  const codec = audioStream.codec_name ?? "";
  const allowed = ALLOWED_CODEC_PREFIXES.some((p) => codec.startsWith(p));
  if (!allowed) {
    const error = `Unsupported audio codec "${codec}". Only MP3 and WAV are accepted.`;
    logger.error("Validation failed", { error, codec });
    return { valid: false, durationSeconds: 0, error };
  }

  const rawDuration =
    audioStream.duration ?? probe.format?.duration ?? "0";
  const durationSeconds = parseFloat(rawDuration);

  if (isNaN(durationSeconds) || durationSeconds < MIN_DURATION_SECONDS) {
    const error = `Invalid or too-short duration: ${rawDuration}s`;
    logger.error("Validation failed", { error });
    return { valid: false, durationSeconds: 0, error };
  }

  logger.info("Audio file valid", {
    codec: audioStream.codec_name,
    durationSeconds,
  });

  return {
    valid: true,
    durationSeconds,
    codec: audioStream.codec_name,
  };
}
