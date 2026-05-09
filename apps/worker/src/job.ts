import { downloadFile } from "./download";
import { validateAudioFile } from "./validate";
import { transcodeVariant, generateMasterPlaylist } from "./hls";
import { ensureDir, outputDir, tempDir, tempSourcePath, extractExt, removeDir } from "./fs-utils";
import { logger } from "./logger";
import { config } from "./config";
import type { JobPayload, TranscodeResult } from "./types";

export async function processJob(payload: JobPayload): Promise<TranscodeResult> {
  const { id, key, filename, userid } = payload;

  logger.info("Job started", { id, filename, userid });

  const downloadUrl = `${config.sourceBaseUrl.replace(/\/$/, "")}/${key}`;
  const ext = extractExt(filename);
  const sourcePath = tempSourcePath(id, ext);
  const jobOutputDir = outputDir(id);

  const ALLOWED_EXTS = ["mp3", "wav"];
  if (!ALLOWED_EXTS.includes(ext.toLowerCase())) {
    logger.error("Unsupported file type", { filename, ext });
    return {
      id, key, filename, userid,
      success: false,
      outputDir: jobOutputDir,
      variants: [],
      masterPlaylist: "",
      durationSeconds: 0,
      error: `Unsupported file type "${ext}". Only MP3 and WAV are accepted.`,
    };
  }

  await ensureDir(jobOutputDir);
  await ensureDir(tempDir(id));

  const baseResult = { id, key, filename, userid };

  try {
    // 1. Download
    await downloadFile(downloadUrl, sourcePath);

    // 2. Validate
    const validation = await validateAudioFile(sourcePath);
    if (!validation.valid) {
      return {
        ...baseResult,
        success: false,
        outputDir: jobOutputDir,
        variants: [],
        masterPlaylist: "",
        durationSeconds: 0,
        error: validation.error,
      };
    }

    // 3. Transcode all variants (sequentially to bound memory usage)
    const variants = [];
    for (const bitrateKbps of config.bitratesKbps) {
      const variant = await transcodeVariant(id, sourcePath, bitrateKbps);
      variants.push(variant);
    }

    // 4. Generate master playlist
    const masterPlaylist = await generateMasterPlaylist(id, variants);

    logger.info("Job complete", {
      id,
      variants: variants.length,
      durationSeconds: validation.durationSeconds,
      outputDir: jobOutputDir,
    });

    return {
      ...baseResult,
      success: true,
      outputDir: jobOutputDir,
      variants,
      masterPlaylist,
      durationSeconds: validation.durationSeconds,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error("Job failed", { id, error });

    return {
      ...baseResult,
      success: false,
      outputDir: jobOutputDir,
      variants: [],
      masterPlaylist: "",
      durationSeconds: 0,
      error,
    };
  } finally {
    // 5. Always clean up temp files
    await removeDir(tempDir(id));
    logger.debug("Temp files cleaned", { id });
  }
}
