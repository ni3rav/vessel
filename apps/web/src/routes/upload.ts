import { db } from "@/db";
import { uploads } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { publishTranscodeJob } from "@/lib/service-bus";
import { handlePublishFailure } from "@/lib/upload-failure";
import { deriveOutputPrefixFromUploadKey } from "@/lib/upload-hls";
import { tryCatch } from "@/lib/try-catch";
import {
  createR2Client,
  deleteObject,
  deleteObjects,
  getPresignedUploadUrl,
  getPublicUrl,
  listObjectKeys,
} from "@vessel/r2";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { nanoid } from "nanoid";
import { createHash } from "node:crypto";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav"];
const ALLOWED_EXTENSIONS = [".mp3", ".wav"];

function validateUpload(filename: string, contentType: string, size: number): string | null {
  const ext = `.${filename.split(".").pop()?.toLowerCase() ?? ""}`;
  const mimeOk = ALLOWED_MIME_TYPES.includes(contentType);
  const extOk = ALLOWED_EXTENSIONS.includes(ext);
  if (!mimeOk && !extOk) return "Only MP3 and WAV files are allowed";
  if (size > MAX_FILE_SIZE_BYTES) return "File exceeds the 15MB limit";
  return null;
}

async function triggerProcessingJob(input: {
  id: string;
  key: string;
  filename: string;
  userId: string;
  jobSecret: string;
}): Promise<void> {
  await publishTranscodeJob({
    id: input.id,
    key: input.key,
    filename: input.filename,
    userid: input.userId,
    jobSecret: input.jobSecret,
  });
}


const r2 = createR2Client({
  accountId: env.R2_ACCOUNT_ID,
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
});

export const uploadRouter = new Elysia({ prefix: "/upload" })
  .post("/presign", async ({ request, body }) => {
    const { data: session, error: sessionError } = await tryCatch(
      auth.api.getSession({ headers: request.headers })
    );
    if (sessionError || !session) return new Response("Unauthorized", { status: 401 });

    const { filename, contentType, size } = body as {
      filename: string;
      contentType: string;
      size: number;
    };

    const validationError = validateUpload(filename, contentType, size);
    if (validationError) return new Response(validationError, { status: 422 });

    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const uuid = crypto.randomUUID();
    const key = `uploads/${session.user.id}/${uuid}/${uuid}.${ext}`;

    const { data: presigned, error: presignError } = await tryCatch(
      getPresignedUploadUrl(r2, {
        bucket: env.R2_BUCKET,
        key,
        contentType,
        contentLength: size,
      })
    );
    if (presignError) return new Response("Failed to generate upload URL", { status: 500 });

    return {
      uploadUrl: presigned.url,
      key,
      publicUrl: getPublicUrl(env.NEXT_PUBLIC_R2_PUBLIC_URL, key),
      expiresAt: presigned.expiresAt,
    };
  })
  .post("/complete", async ({ request, body }) => {
    const { data: session, error: sessionError } = await tryCatch(
      auth.api.getSession({ headers: request.headers })
    );
    if (sessionError || !session) return new Response("Unauthorized", { status: 401 });

    const { key, filename, contentType, size } = body as {
      key: string;
      filename: string;
      contentType: string;
      size: number;
    };

    const validationError = validateUpload(filename, contentType, size);
    if (validationError) return new Response(validationError, { status: 422 });

    const id = crypto.randomUUID();
    const jobSecret = nanoid(24);
    const jobSecretHash = createHash("sha256").update(jobSecret).digest("hex");
    const publicUrl = getPublicUrl(env.NEXT_PUBLIC_R2_PUBLIC_URL, key);

    const { error: dbInsertError } = await tryCatch(
      db.transaction(async (tx) => {
        await tx.insert(uploads).values({
          id,
          key,
          filename,
          contentType,
          size,
          publicUrl,
          jobSecretHash,
          status: "processing",
          userId: session.user.id,
        });
      })
    );
    if (dbInsertError) {
      console.error("[upload.complete] DB insert failed", {
        uploadId: id,
        userId: session.user.id,
        key,
        error: dbInsertError,
      });
      return new Response("Failed to complete upload", { status: 500 });
    }

    const { error: publishError } = await tryCatch(
      triggerProcessingJob({
        id,
        key,
        filename,
        userId: session.user.id,
        jobSecret,
      }),
    );
    if (publishError) {
      console.error("[upload.complete] Service Bus publish failed", {
        uploadId: id,
        userId: session.user.id,
        key,
        error: publishError,
      });
      await handlePublishFailure(
        { id, userId: session.user.id, key },
        {
          markFailed: (uploadId) =>
            db
              .update(uploads)
              .set({ status: "failed" })
              .where(eq(uploads.id, uploadId))
              .then(() => undefined),
          deleteSource: (objectKey) =>
            deleteObject(r2, { bucket: env.R2_BUCKET, key: objectKey }).then(() => undefined),
        },
      );
      return new Response("Failed to enqueue processing job", { status: 500 });
    }

    return { id, publicUrl };
  })
  .delete("/:id", async ({ params, request }) => {
    const { data: session, error: sessionError } = await tryCatch(
      auth.api.getSession({ headers: request.headers }),
    );
    if (sessionError || !session) return new Response("Unauthorized", { status: 401 });

    const id = params.id;
    if (!id) return new Response("Missing upload id", { status: 400 });

    const { data: row, error: lookupError } = await tryCatch(
      db
        .select({
          id: uploads.id,
          key: uploads.key,
          status: uploads.status,
        })
        .from(uploads)
        .where(and(eq(uploads.id, id), eq(uploads.userId, session.user.id)))
        .then((rows) => rows[0] ?? null),
    );

    if (lookupError) {
      console.error("[upload.delete] Lookup failed", { uploadId: id, error: lookupError });
      return new Response("Failed to delete upload", { status: 500 });
    }
    if (!row) return new Response("Upload not found", { status: 404 });
    if (row.status === "processing" || row.status === "uploading") {
      return new Response("Cannot delete while processing", { status: 409 });
    }

    const { error: storageError } = await tryCatch(deleteUploadObjects(row.key));
    if (storageError) {
      console.error("[upload.delete] Storage cleanup failed", {
        uploadId: id,
        key: row.key,
        error: storageError,
      });
      return new Response("Failed to delete storage objects", { status: 500 });
    }

    const { error: dbError } = await tryCatch(
      db.delete(uploads).where(and(eq(uploads.id, id), eq(uploads.userId, session.user.id))),
    );
    if (dbError) {
      console.error("[upload.delete] DB delete failed", { uploadId: id, error: dbError });
      return new Response("Failed to delete upload", { status: 500 });
    }

    return { id, deleted: true };
  });

async function deleteUploadObjects(sourceKey: string): Promise<void> {
  const keys = new Set<string>([sourceKey]);
  const outputPrefix = deriveOutputPrefixFromUploadKey(sourceKey);

  if (outputPrefix) {
    const listed = await listObjectKeys(r2, {
      bucket: env.R2_BUCKET,
      prefix: `${outputPrefix}/`,
    });
    for (const key of listed.keys) keys.add(key);
  }

  const keyList = [...keys];
  if (keyList.length === 1) {
    await deleteObject(r2, { bucket: env.R2_BUCKET, key: keyList[0]! });
    return;
  }

  const result = await deleteObjects(r2, { bucket: env.R2_BUCKET, keys: keyList });
  if (result.failedKeys.length > 0) {
    throw new Error(
      `Failed to delete ${result.failedKeys.length} object(s): ${result.failedKeys[0]?.error ?? "unknown"}`,
    );
  }
}
