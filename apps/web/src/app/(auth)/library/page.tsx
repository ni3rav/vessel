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

  return (
    <section className="w-full space-y-8 animate-in fade-in duration-300">
      <header className="space-y-2">
        <h1 className="font-heading text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Your library
        </h1>
        <p className="text-pretty text-sm text-muted-foreground sm:text-base">
          Stream processed uploads as HLS when they are ready. Pending uploads stay here until processing finishes.
        </p>
      </header>

      <UploadLibrary uploads={serialized} r2PublicBaseUrl={env.NEXT_PUBLIC_R2_PUBLIC_URL} />
    </section>
  );
}
