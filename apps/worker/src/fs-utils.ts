import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { logger } from "./logger";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function removeDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (err) {
    logger.warn("Failed to remove directory", { dirPath, error: String(err) });
  }
}

export async function removeFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    logger.warn("Failed to remove file", { filePath, error: String(err) });
  }
}

export async function listFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.map((e) => path.join(dirPath, e));
  } catch (_) {
    return [];
  }
}

export function tempDir(audioId: string): string {
  return path.join(config.tempDir, audioId);
}

export function tempSourcePath(audioId: string, ext: string): string {
  return path.join(tempDir(audioId), `source.${ext}`);
}

export function outputDir(audioId: string): string {
  return path.join(config.outputDir, audioId);
}

export function variantDir(audioId: string, bitrateKbps: number): string {
  return path.join(outputDir(audioId), `${bitrateKbps}k`);
}

export function variantSegmentsDir(audioId: string, bitrateKbps: number): string {
  return path.join(variantDir(audioId, bitrateKbps), "segments");
}

export function masterPlaylistPath(audioId: string): string {
  return path.join(outputDir(audioId), "master.m3u8");
}

export function variantPlaylistPath(audioId: string, bitrateKbps: number): string {
  return path.join(variantDir(audioId, bitrateKbps), "playlist.m3u8");
}

export function variantSegmentPattern(audioId: string, bitrateKbps: number): string {
  return path.join(variantSegmentsDir(audioId, bitrateKbps), "segment_%03d.ts");
}

export function extractExt(filename: string): string {
  const ext = path.extname(filename).replace(".", "").toLowerCase();
  return ext || "mp3";
}
