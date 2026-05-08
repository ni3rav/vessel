import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3Client } from "@aws-sdk/client-s3";
import type { PresignedUploadOptions, PresignedUploadResult } from "./types";

export async function getPresignedUploadUrl(
  client: S3Client,
  options: PresignedUploadOptions,
): Promise<PresignedUploadResult> {
  const { bucket, key, contentType, expiresIn = 3600, contentLength } = options;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ...(contentLength !== undefined && { ContentLength: contentLength }),
  });

  const url = await getSignedUrl(client, command, { expiresIn });

  return {
    url,
    key,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}
