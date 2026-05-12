ALTER TYPE "public"."upload_status" ADD VALUE 'uploading' BEFORE 'processing';--> statement-breakpoint
ALTER TABLE "uploads" ALTER COLUMN "status" SET DEFAULT 'uploading';--> statement-breakpoint
ALTER TABLE "uploads" ADD COLUMN "job_secret_hash" text;