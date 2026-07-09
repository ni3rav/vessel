import { db } from "@/db";
import { uploads } from "@/db/schema";
import { env } from "@/lib/env";
import { tryCatch } from "@/lib/try-catch";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { Elysia } from "elysia";

export const cronRouter = new Elysia({ prefix: "/cron" }).get(
  "/cleanup-uploads",
  async ({ request, set }) => {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
      set.status = 401;
      return "Unauthorized";
    }

    // All time comparisons are evaluated inside Postgres so the clock matches
    // the one that stamped created_at via defaultNow() / NOW().
    const staleUploading = and(
      eq(uploads.status, "uploading"),
      lt(uploads.createdAt, sql`NOW() - INTERVAL '15 minutes'`)
    );

    const staleProcessing = and(
      eq(uploads.status, "processing"),
      lt(uploads.createdAt, sql`NOW() - INTERVAL '1 hour'`)
    );

    const failed = eq(uploads.status, "failed");

    const result = await tryCatch(
      db
        .delete(uploads)
        .where(or(staleUploading, staleProcessing, failed))
        .returning({ id: uploads.id, status: uploads.status })
    );

    if (result.error) {
      set.status = 500;
      console.error("[cron.cleanup-uploads] Failed to delete uploads", result.error);
      return { error: "Failed to cleanup uploads", deleted: 0 };
    }

    const deleted = result.data as Array<{ id: string; status: string }>;
    console.info("[cron.cleanup-uploads] Deleted stale/failed upload records", {
      count: deleted.length,
      ids: deleted.map((r) => ({ id: r.id, status: r.status })),
    });

    return { deleted: deleted.length };
  }
);
