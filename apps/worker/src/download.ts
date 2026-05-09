import http, { IncomingMessage } from "node:http";
import https from "node:https";
import fs from "node:fs";
import { ensureDir } from "./fs-utils";
import { logger } from "./logger";
import path from "node:path";

const MAX_REDIRECTS = 5;
const MAX_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB safety cap

function getClient(url: string) {
  return url.startsWith("https://") ? https : http;
}

function downloadOnce(
  url: string,
  destPath: string,
  redirectsLeft: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = getClient(url);

    const req = client.get(url, (res: IncomingMessage) => {
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        if (redirectsLeft <= 0) {
          reject(new Error("Too many redirects"));
          return;
        }
        const next = new URL(res.headers.location, url).toString();
        logger.debug("Following redirect", { to: next });
        resolve(downloadOnce(next, destPath, redirectsLeft - 1));
        return;
      }

      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
        return;
      }

      let received = 0;
      const fileStream = fs.createWriteStream(destPath);

      res.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_SIZE_BYTES) {
          req.destroy();
          fileStream.destroy();
          reject(new Error(`Download exceeds safety cap of ${MAX_SIZE_BYTES} bytes`));
        }
      });

      res.pipe(fileStream);

      fileStream.on("finish", () => {
        logger.debug("Download complete", { destPath, bytes: received });
        resolve();
      });

      fileStream.on("error", reject);
      res.on("error", reject);
    });

    req.on("error", reject);
  });
}

export async function downloadFile(url: string, destPath: string): Promise<void> {
  logger.info("Downloading source file", { url, destPath });
  await ensureDir(path.dirname(destPath));
  await downloadOnce(url, destPath, MAX_REDIRECTS);
}
