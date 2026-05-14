export { createR2Client } from "./client";
export { getPresignedUploadUrl, uploadObject } from "./upload";
export { deleteObject, deleteObjects } from "./delete";
export { getPublicUrl } from "./download";
export type {
  DeleteObjectOptions,
  DeleteObjectResult,
  DeleteObjectsOptions,
  DeleteObjectsResult,
  DirectUploadOptions,
  R2ClientConfig,
  PresignedUploadOptions,
  PresignedUploadResult,
} from "./types";
