import { db } from "@/db";
import { uploads } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { tryCatch } from "@/lib/try-catch";
import { createR2Client, deleteObject, getPresignedUploadUrl, getPublicUrl } from "@vessel/r2";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { nanoid } from "nanoid";
import { createHash } from "node:crypto";
import { z } from "zod";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav"];
const ALLOWED_EXTENSIONS = [".mp3", ".wav"];
const TRIGGER_RESPONSE_SCHEMA = z.object({
  accepted: z.literal(true),
  id: z.string().min(1),
  status: z.literal("processing"),
});

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
  const triggerPayload = {
    id: input.id,
    key: input.key,
    filename: input.filename,
    userid: input.userId,
  };

  const res = await fetch(env.TRIGGER_FUNCTION_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-trigger-token": env.TRIGGER_SECRET,
      "x-job-secret": input.jobSecret,
    },
    body: JSON.stringify(triggerPayload),
  });

  if (!res.ok) {
    const responseText = await res.text();
    throw new Error(responseText || `Trigger function failed with HTTP ${res.status}`);
  }

  const { data: responseBody, error: responseReadError } = await tryCatch(res.json());
  if (responseReadError) {
    throw new Error("Trigger function returned invalid JSON response");
  }

  const parsed = TRIGGER_RESPONSE_SCHEMA.safeParse(responseBody);
  if (!parsed.success) {
    throw new Error("Trigger function response shape is invalid");
  }

  if (parsed.data.id !== input.id) {
    throw new Error("Trigger function response id mismatch");
  }
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
          status: "uploading",
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

    const { error: triggerError } = await tryCatch(
      triggerProcessingJob({
        id,
        key,
        filename,
        userId: session.user.id,
        jobSecret,
      })
    );
    if (triggerError) {
      console.error("[upload.complete] Trigger function call failed", {
        uploadId: id,
        userId: session.user.id,
        key,
        triggerUrl: env.TRIGGER_FUNCTION_URL,
        error: triggerError,
      });

      const { error: markFailedError } = await tryCatch(
        db.transaction(async (tx) => {
          await tx
            .update(uploads)
            .set({ status: "failed" })
            .where(eq(uploads.id, id));
        })
      );
      if (markFailedError) {
        console.error("[upload.complete] Failed to mark upload as failed after trigger error", {
          uploadId: id,
          userId: session.user.id,
          key,
          error: markFailedError,
        });
      }

      const { error: deleteError } = await tryCatch(
        deleteObject(r2, {
          bucket: env.R2_BUCKET,
          key,
        })
      );
      if (deleteError) {
        console.error("[upload.complete] Failed to cleanup source object after trigger failure", {
          uploadId: id,
          userId: session.user.id,
          key,
          reason: "trigger_failed",
          deleteAttempted: true,
          deleteSucceeded: false,
          error: deleteError,
        });
      } else {
        console.info("[upload.complete] Cleaned up source object after trigger failure", {
          uploadId: id,
          userId: session.user.id,
          key,
          reason: "trigger_failed",
          deleteAttempted: true,
          deleteSucceeded: true,
        });
      }

      return new Response("Failed to complete upload", { status: 500 });
    }

    return { id, publicUrl };
  });
