import { S3Client } from "@aws-sdk/client-s3";
import type { R2ClientConfig } from "./types";

export function createR2Client(config: R2ClientConfig): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
