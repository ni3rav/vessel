import fs from "node:fs/promises";
import { spawnFfmpeg } from "./ffmpeg";
import {
  ensureDir,
  variantDir,
  variantSegmentsDir,
  variantPlaylistPath,
  variantSegmentPattern,
  masterPlaylistPath,
  listFiles,
} from "./fs-utils";
import { logger } from "./logger";
import { config } from "./config";
import type { BitrateVariant } from "./types";

export async function transcodeVariant(
  id: string,
  sourcePath: string,
  bitrateKbps: number,
): Promise<BitrateVariant> {
  const dirPath = variantDir(id, bitrateKbps);
  const segmentsDirPath = variantSegmentsDir(id, bitrateKbps);
  const playlistPath = variantPlaylistPath(id, bitrateKbps);
  const segmentPattern = variantSegmentPattern(id, bitrateKbps);

  await ensureDir(dirPath);
  await ensureDir(segmentsDirPath);

  logger.info("Transcoding variant", { id, bitrateKbps });

  await spawnFfmpeg([
    "-i", sourcePath,
    "-c:a", "aac",
    "-b:a", `${bitrateKbps}k`,
    "-vn",
    "-ac", "2",
    "-ar", "44100",
    "-hls_time", String(config.hlsSegmentDuration),
    "-hls_list_size", "0",
    "-hls_segment_filename", segmentPattern,
    "-hls_base_url", "segments/",
    "-hls_flags", "independent_segments",
    "-hls_segment_type", "mpegts",
    "-f", "hls",
    playlistPath,
  ]);

  const allFiles = await listFiles(segmentsDirPath);
  const segments = allFiles
    .filter((f) => f.endsWith(".ts"))
    .sort();

  logger.info("Variant complete", {
    id,
    bitrateKbps,
    segments: segments.length,
  });

  return {
    bitrate: `${bitrateKbps}k`,
    bitrateKbps,
    outputDir: dirPath,
    playlist: playlistPath,
    segments,
  };
}

export async function generateMasterPlaylist(
  id: string,
  variants: BitrateVariant[],
): Promise<string> {
  const masterPath = masterPlaylistPath(id);

  const lines: string[] = ["#EXTM3U", "#EXT-X-VERSION:3", ""];

  const sorted = [...variants].sort((a, b) => a.bitrateKbps - b.bitrateKbps);

  for (const v of sorted) {
    const bandwidth = v.bitrateKbps * 1000;
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},CODECS="mp4a.40.2"`);
    lines.push(`${v.bitrateKbps}k/playlist.m3u8`);
  }

  lines.push("");

  await fs.writeFile(masterPath, lines.join("\n"), "utf-8");
  logger.info("Master playlist written", { masterPath, variants: sorted.length });

  return masterPath;
}
