import fs from "node:fs/promises";
import { createR2Client, getPublicUrl, uploadObject } from "@vessel/r2";
import { config } from "./config";

const client = createR2Client({
  accountId: config.r2AccountId,
  accessKeyId: config.r2AccessKeyId,
  secretAccessKey: config.r2SecretAccessKey,
});

function assertR2Config(): void {
  const missing: string[] = [];
  if (!config.r2AccountId) missing.push("R2_ACCOUNT_ID");
  if (!config.r2AccessKeyId) missing.push("R2_ACCESS_KEY_ID");
  if (!config.r2SecretAccessKey) missing.push("R2_SECRET_ACCESS_KEY");
  if (!config.r2Bucket) missing.push("R2_BUCKET");
  if (!config.r2PublicBaseUrl) missing.push("R2_PUBLIC_BASE_URL");

  if (missing.length > 0) {
    throw new Error(`Missing required R2 environment variables: ${missing.join(", ")}`);
  }
}

export function getPublicDownloadUrl(key: string): string {
  assertR2Config();
  return getPublicUrl(config.r2PublicBaseUrl, key);
}

export async function uploadTextObject(
  key: string,
  body: string,
  contentType: string,
): Promise<void> {
  assertR2Config();
  await uploadObject(client, {
    bucket: config.r2Bucket,
    key,
    body,
    contentType,
  });
}

export async function uploadFileObject(
  key: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  assertR2Config();
  const body = await fs.readFile(filePath);
  await uploadObject(client, {
    bucket: config.r2Bucket,
    key,
    body,
    contentType,
  });
}
