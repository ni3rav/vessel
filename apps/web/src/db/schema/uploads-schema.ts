import { relations } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const uploadStatusEnum = pgEnum("upload_status", [
  "uploading",
  "processing",
  "ready",
  "failed",
]);

export const uploads = pgTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    publicUrl: text("public_url").notNull(),
    jobSecretHash: text("job_secret_hash"),
    status: uploadStatusEnum("status").notNull().default("uploading"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("uploads_userId_idx").on(table.userId)]
);

export const uploadsRelations = relations(uploads, ({ one }) => ({
  user: one(user, {
    fields: [uploads.userId],
    references: [user.id],
  }),
}));

export const userUploadsRelations = relations(user, ({ many }) => ({
  uploads: many(uploads),
}));
