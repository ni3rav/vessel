export { createR2Client } from "./client";
export { getPresignedUploadUrl, uploadObject } from "./upload";
export { deleteKeyAndPrefix, deleteObject, deleteObjects } from "./delete";
export { listObjectKeys } from "./list";
export { getPublicUrl } from "./download";
export type {
  DeleteKeyAndPrefixOptions,
  DeleteKeyAndPrefixResult,
  DeleteObjectOptions,
  DeleteObjectResult,
  DeleteObjectsOptions,
  DeleteObjectsResult,
  DirectUploadOptions,
  ListObjectKeysOptions,
  ListObjectKeysResult,
  R2ClientConfig,
  PresignedUploadOptions,
  PresignedUploadResult,
} from "./types";
