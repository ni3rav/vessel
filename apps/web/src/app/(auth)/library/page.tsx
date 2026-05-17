import { UploadLibrary } from "@/components/upload-library";
import { db } from "@/db";
import { uploads } from "@/db/schema";
import { env } from "@/lib/env";
import { requireSession } from "@/lib/auth-guard";
import { desc, eq } from "drizzle-orm";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

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
  const selectedParam = params.selected;
  const uploadIdParam = params.uploadId;
  const selectedFromQuery = Array.isArray(selectedParam) ? selectedParam[0] : selectedParam;
  const uploadIdFromQuery = Array.isArray(uploadIdParam) ? uploadIdParam[0] : uploadIdParam;
  const initialSelectedId =
    selectedFromQuery && serialized.some((r) => r.id === selectedFromQuery)
      ? selectedFromQuery
      : uploadIdFromQuery && serialized.some((r) => r.id === uploadIdFromQuery)
        ? uploadIdFromQuery
        : serialized[0]?.id;

  return (
    <section className="w-full min-h-[min(100dvh,56rem)]">
      <UploadLibrary
        uploads={serialized}
        r2PublicBaseUrl={env.NEXT_PUBLIC_R2_PUBLIC_URL}
        initialSelectedId={initialSelectedId}
      />
    </section>
  );
}
