import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import type { ListObjectKeysOptions, ListObjectKeysResult } from "./types";

function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+/, "");
}

export async function listObjectKeys(
  client: S3Client,
  options: ListObjectKeysOptions,
): Promise<ListObjectKeysResult> {
  const prefix = normalizePrefix(options.prefix);
  if (!prefix) {
    throw new Error("ListObjectKeys requires a non-empty prefix.");
  }

  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: options.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const item of response.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return { keys };
}
