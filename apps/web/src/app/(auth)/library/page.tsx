import { UploadLibrary } from "@/components/upload-library";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { env } from "@/lib/env";
import { requireSession } from "@/lib/auth-guard";
import { desc, eq } from "drizzle-orm";

export default async function LibraryPage() {
  const session = await requireSession();

  const rows = await db
    .select({
      id: uploads.id,
      key: uploads.key,
      filename: uploads.filename,
      status: uploads.status,
      publicUrl: uploads.publicUrl,
      createdAt: uploads.createdAt,
    })
    .from(uploads)
    .where(eq(uploads.userId, session.user.id))
    .orderBy(desc(uploads.createdAt));

  const serialized = rows.map((r) => ({
    id: r.id,
    key: r.key,
    filename: r.filename,
    status: r.status,
    publicUrl: r.publicUrl,
    createdAt: r.createdAt.toISOString(),
  }));
  const hasPendingUploads = serialized.some((r) => r.status === "uploading" || r.status === "processing");

  return (
    <section className="w-full min-h-[min(100dvh,56rem)]">
      {hasPendingUploads ? <meta httpEquiv="refresh" content="7" /> : null}
      <UploadLibrary uploads={serialized} r2PublicBaseUrl={env.NEXT_PUBLIC_R2_PUBLIC_URL} />
    </section>
  );
}
