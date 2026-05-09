import { db } from "@/db";
import { uploads } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { tryCatch } from "@/lib/try-catch";
import { createR2Client, getPresignedUploadUrl, getPublicUrl } from "@vessel/r2";
import { Elysia } from "elysia";

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
    const key = `uploads/${session.user.id}/${uuid}.${ext}`;

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
    const publicUrl = getPublicUrl(env.NEXT_PUBLIC_R2_PUBLIC_URL, key);

    const { error: dbError } = await tryCatch(
      db.insert(uploads).values({
        id,
        key,
        filename,
        contentType,
        size,
        publicUrl,
        status: "processing",
        userId: session.user.id,
      })
    );
    if (dbError) return new Response("Failed to record upload", { status: 500 });

    return { id, publicUrl };
  });
