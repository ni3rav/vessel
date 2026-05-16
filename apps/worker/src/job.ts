import { downloadFile } from "./download";
import { validateAudioFile } from "./validate";
import { transcodeVariant, generateMasterPlaylist } from "./hls";
import { deriveOutputPrefixFromSourceKey } from "./key-utils";
import { ensureDir, outputDir, tempDir, tempSourcePath, extractExt, removeDir } from "./fs-utils";
import { logger } from "./logger";
import { config } from "./config";
import path from "node:path";
import { getPublicDownloadUrl, uploadFileObject } from "./r2-storage";
import type { JobPayload, TranscodeResult } from "./types";

export async function processJob(payload: JobPayload): Promise<TranscodeResult> {
  const { id, key, filename, userid } = payload;

  logger.info("Job started", { id, filename, userid });

  const sourceKey = key.replace(/^\//, "").replace(/\\/g, "/");
  const extFromKey = path.posix.extname(sourceKey);
  const stemFromKey = path.posix.basename(sourceKey, extFromKey);
  const sourceUuid = stemFromKey || id;
  const outputPrefix = deriveOutputPrefixFromSourceKey(sourceKey);
  const downloadUrl = getPublicDownloadUrl(sourceKey);
  const ext = extractExt(filename);
  const sourcePath = tempSourcePath(sourceUuid, ext);
  const jobOutputDir = outputDir(sourceUuid);

  const ALLOWED_EXTS = ["mp3", "wav"];
  if (!ALLOWED_EXTS.includes(ext.toLowerCase())) {
    logger.error("Unsupported file type", { filename, ext });
    return {
      id,
      key,
      filename,
      userid,
      success: false,
      outputDir: outputPrefix,
      variants: [],
      masterPlaylist: "",
      durationSeconds: 0,
      error: `Unsupported file type "${ext}". Only MP3 and WAV are accepted.`,
    };
  }

  await ensureDir(jobOutputDir);
  await ensureDir(tempDir(sourceUuid));

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
        outputDir: outputPrefix,
        variants: [],
        masterPlaylist: "",
        durationSeconds: 0,
        error: validation.error,
      };
    }

    // 3. Transcode all variants (sequentially to bound memory usage)
    const variants = [];
    for (const bitrateKbps of config.bitratesKbps) {
      const variant = await transcodeVariant(sourceUuid, sourcePath, bitrateKbps);
      variants.push(variant);
    }

    // 4. Generate master playlist
    const localMasterPlaylist = await generateMasterPlaylist(sourceUuid, variants);

    // 5. Upload generated HLS outputs to R2
    const totalUploadObjects =
      1 + // master playlist
      variants.length + // one variant playlist per bitrate
      variants.reduce((count, variant) => count + variant.segments.length, 0); // segments
    let uploadedObjects = 0;
    const logUploadProgress = (uploadedKey: string): void => {
      uploadedObjects += 1;
      logger.info("R2 upload progress", {
        id,
        uploadedObjects,
        totalUploadObjects,
        percent: Math.round((uploadedObjects / totalUploadObjects) * 100),
        key: uploadedKey,
      });
    };

    const uploadedVariants = [];
    for (const variant of variants) {
      const variantPrefix = `${outputPrefix}/${variant.bitrate}`;
      const playlistKey = `${variantPrefix}/playlist.m3u8`;
      await uploadFileObject(playlistKey, variant.playlist, "application/vnd.apple.mpegurl");
      logUploadProgress(playlistKey);

      const segmentKeys: string[] = [];
      for (const segmentPath of variant.segments) {
        const segmentKey = `${variantPrefix}/${path.basename(segmentPath)}`;
        await uploadFileObject(segmentKey, segmentPath, "video/mp2t");
        logUploadProgress(segmentKey);
        segmentKeys.push(segmentKey);
      }

      uploadedVariants.push({
        bitrate: variant.bitrate,
        bitrateKbps: variant.bitrateKbps,
        outputDir: variantPrefix,
        playlist: playlistKey,
        segments: segmentKeys,
      });
    }

    const masterPlaylistKey = `${outputPrefix}/master.m3u8`;
    await uploadFileObject(masterPlaylistKey, localMasterPlaylist, "application/vnd.apple.mpegurl");
    logUploadProgress(masterPlaylistKey);

    logger.info("Job complete", {
      id,
      variants: uploadedVariants.length,
      durationSeconds: validation.durationSeconds,
      outputPrefix,
    });

    return {
      ...baseResult,
      success: true,
      outputDir: outputPrefix,
      variants: uploadedVariants,
      masterPlaylist: masterPlaylistKey,
      durationSeconds: validation.durationSeconds,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error("Job failed", { id, error });

    return {
      ...baseResult,
      success: false,
      outputDir: outputPrefix,
      variants: [],
      masterPlaylist: "",
      durationSeconds: 0,
      error,
    };
  } finally {
    // 6. Always clean up local temp + output files
    await removeDir(tempDir(sourceUuid));
    await removeDir(jobOutputDir);
    await removeDir(config.tempDir);
    await removeDir(config.outputDir);
    logger.debug("Local files cleaned", {
      id,
      sourceUuid,
      tempDir: config.tempDir,
      outputDir: config.outputDir,
    });
  }
}
