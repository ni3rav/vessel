import { DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import { listObjectKeys } from "./list";
import type {
  DeleteKeyAndPrefixOptions,
  DeleteKeyAndPrefixResult,
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

function directoryPrefix(prefix: string): string {
  const normalized = prefix.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("DeleteKeyAndPrefix requires a non-empty prefix.");
  }
  return `${normalized}/`;
}

async function deleteCollectedKeys(
  client: S3Client,
  bucket: string,
  keys: string[],
): Promise<string[]> {
  if (keys.length === 1) {
    const onlyKey = keys[0];
    if (!onlyKey) {
      throw new Error("DeleteKeyAndPrefix requires a non-empty key.");
    }
    await deleteObject(client, { bucket, key: onlyKey });
    return [onlyKey];
  }

  const result = await deleteObjects(client, { bucket, keys });
  if (result.failedKeys.length > 0) {
    throw new Error(
      `Failed to delete ${result.failedKeys.length} object(s): ${result.failedKeys[0]?.error ?? "unknown"}`,
    );
  }
  return result.deletedKeys;
}

export async function deleteKeyAndPrefix(
  client: S3Client,
  options: DeleteKeyAndPrefixOptions,
): Promise<DeleteKeyAndPrefixResult> {
  const key = normalizeKey(options.key);
  if (!key) {
    throw new Error("DeleteKeyAndPrefix requires a non-empty key.");
  }

  const rawPrefix = options.prefix?.trim() ?? "";
  const prefix = rawPrefix ? directoryPrefix(rawPrefix) : null;
  const keys = new Set<string>([key]);

  if (prefix) {
    const listed = await listObjectKeys(client, { bucket: options.bucket, prefix });
    for (const listedKey of listed.keys) keys.add(listedKey);
  }

  const deletedKeys = await deleteCollectedKeys(client, options.bucket, [...keys]);

  if (prefix) {
    const remaining = await listObjectKeys(client, { bucket: options.bucket, prefix });
    if (remaining.keys.length > 0) {
      throw new Error(`Objects remain under prefix after delete (${remaining.keys.length}).`);
    }
  }

  return { deletedKeys };
}
