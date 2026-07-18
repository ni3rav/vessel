export interface R2ClientConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface PresignedUploadOptions {
  bucket: string;
  key: string;
  contentType: string;
  /** Expiry in seconds. Defaults to 3600 (1 hour). */
  expiresIn?: number;
  /** Max allowed file size in bytes. */
  contentLength?: number;
}

export interface PresignedUploadResult {
  url: string;
  key: string;
  expiresAt: Date;
}

export interface DirectUploadOptions {
  bucket: string;
  key: string;
  body: Uint8Array | string;
  contentType?: string;
  cacheControl?: string;
}

export interface DeleteObjectOptions {
  bucket: string;
  key: string;
}

export interface DeleteObjectsOptions {
  bucket: string;
  keys: string[];
}

export interface DeleteObjectResult {
  key: string;
  deleted: boolean;
}

export interface DeleteObjectsResult {
  deletedKeys: string[];
  failedKeys: Array<{ key: string; error: string }>;
}

export interface ListObjectKeysOptions {
  bucket: string;
  prefix: string;
}

export interface ListObjectKeysResult {
  keys: string[];
}
