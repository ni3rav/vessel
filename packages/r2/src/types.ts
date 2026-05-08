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
