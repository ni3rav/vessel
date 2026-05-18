import { z } from "zod";

const booleanish = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

export const env = z
  .object({
    DATABASE_URL: z.url(),
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
    CLEANUP_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
    CLEANUP_PROCESSING_TTL_HOURS: z.coerce.number().int().min(1).default(8),
    CLEANUP_SCHEDULE_CRON: z.string().default("0 0 * * *"),
    DRY_RUN: booleanish.default(false),
  })
  .parse(process.env);
