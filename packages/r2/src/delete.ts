import { DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import type {
  DeleteObjectOptions,
  DeleteObjectResult,
  DeleteObjectsOptions,
  DeleteObjectsResult,
} from "./types";

const MAX_DELETE_BATCH_SIZE = 1000;

function normalizeKey(key: string): string {
  return key.replace(/^\/+/, "");
}

export async function deleteObject(
  client: S3Client,
  options: DeleteObjectOptions,
): Promise<DeleteObjectResult> {
  const normalizedKey = normalizeKey(options.key);

  if (!normalizedKey) {
    throw new Error("DeleteObject requires a non-empty key.");
  }

  const command = new DeleteObjectCommand({
    Bucket: options.bucket,
    Key: normalizedKey,
  });

  await client.send(command);

  return {
    key: normalizedKey,
    deleted: true,
  };
}

export async function deleteObjects(
  client: S3Client,
  options: DeleteObjectsOptions,
): Promise<DeleteObjectsResult> {
  if (options.keys.length === 0) {
    throw new Error("DeleteObjects requires at least one key.");
  }

  const normalizedKeys = options.keys.map(normalizeKey);
  const invalidKey = normalizedKeys.find((key) => !key);

  if (invalidKey !== undefined) {
    throw new Error("DeleteObjects received an empty key after normalization.");
  }

  const failedKeys: Array<{ key: string; error: string }> = [];
  const deletedKeys: string[] = [];

  for (let i = 0; i < normalizedKeys.length; i += MAX_DELETE_BATCH_SIZE) {
    const batchKeys = normalizedKeys.slice(i, i + MAX_DELETE_BATCH_SIZE);

    const response = await client.send(
      new DeleteObjectsCommand({
        Bucket: options.bucket,
        Delete: {
          Objects: batchKeys.map((key) => ({ Key: key })),
          Quiet: false,
        },
      }),
    );

    const batchErrors = response.Errors ?? [];
    const errorByKey = new Map(
      batchErrors
        .filter((item): item is { Key: string; Message?: string } => Boolean(item.Key))
        .map((item) => [item.Key, item.Message ?? "Unknown delete failure"]),
    );

    for (const key of batchKeys) {
      const error = errorByKey.get(key);
      if (error) {
        failedKeys.push({ key, error });
      } else {
        // S3/R2 delete is idempotent, so non-existent keys are treated as deleted.
        deletedKeys.push(key);
      }
    }
  }

  return {
    deletedKeys,
    failedKeys,
  };
}
