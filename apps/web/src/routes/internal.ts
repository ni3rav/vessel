import { db } from "@/db";
import { uploads } from "@/db/schema";
import { env } from "@/lib/env";
import { tryCatch } from "@/lib/try-catch";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { createHash } from "node:crypto";
import { z } from "zod";

const TRIGGER_CALLBACK_SCHEMA = z.object({
  id: z.string().min(1),
  status: z.literal("processing"),
  containerGroup: z.string().min(1),
  containerName: z.string().min(1),
  startedAt: z.iso.datetime(),
});

const TRIGGER_TOKEN_HEADER = "x-trigger-token";
const JOB_SECRET_HEADER = "x-job-secret";

export const internalRouter = new Elysia({ prefix: "/internal" }).post(
  "/trigger-callback",
  async ({ request }) => {
    const triggerToken = request.headers.get(TRIGGER_TOKEN_HEADER);
    if (!triggerToken || triggerToken !== env.TRIGGER_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const jobSecret = request.headers.get(JOB_SECRET_HEADER);
    if (!jobSecret) {
      return new Response("Missing job secret header", { status: 400 });
    }

    const { data: rawPayload, error: payloadReadError } = await tryCatch(request.json());
    if (payloadReadError) {
      return new Response("Invalid JSON payload", { status: 400 });
    }

    const parsed = TRIGGER_CALLBACK_SCHEMA.safeParse(rawPayload);
    if (!parsed.success) {
      return new Response("Invalid callback payload", { status: 422 });
    }
    const payload = parsed.data;

    const { data: existingRows, error: selectError } = await tryCatch(
      db
        .select({
          id: uploads.id,
          jobSecretHash: uploads.jobSecretHash,
        })
        .from(uploads)
        .where(eq(uploads.id, payload.id))
        .limit(1)
    );
    if (selectError) {
      console.error("[internal.trigger-callback] Failed to load upload record", {
        id: payload.id,
        error: selectError,
      });
      return new Response("Failed to process callback", { status: 500 });
    }

    const upload = existingRows[0];
    if (!upload) {
      return new Response("Upload not found", { status: 404 });
    }
    if (!upload.jobSecretHash) {
      return new Response("Upload does not have job secret", { status: 409 });
    }

    const incomingSecretHash = createHash("sha256").update(jobSecret).digest("hex");
    if (incomingSecretHash !== upload.jobSecretHash) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { error: updateError } = await tryCatch(
      db
        .update(uploads)
        .set({ status: payload.status })
        .where(eq(uploads.id, payload.id))
    );
    if (updateError) {
      console.error("[internal.trigger-callback] Failed to update upload status", {
        id: payload.id,
        error: updateError,
      });
      return new Response("Failed to process callback", { status: 500 });
    }

    return {
      ok: true,
      id: payload.id,
      status: payload.status,
    };
  }
);
