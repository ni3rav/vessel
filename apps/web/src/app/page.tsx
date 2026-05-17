import Link from "next/link";

export default function Home() {
  return (
    <section className="flex w-full max-w-3xl flex-col items-center justify-center py-10 sm:py-16">
      <p className="font-heading text-xs font-semibold tracking-[0.22em] text-muted-foreground uppercase">Vessel</p>
      <h1 className="mt-3 text-center font-heading text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Upload once, stream everywhere
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-pretty text-sm leading-relaxed text-muted-foreground">
        Add your audio file, let cloud workers process adaptive streams, and play tracks directly from your library.
      </p>
      <nav aria-label="Primary" className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm font-medium">
        <Link
          href="/login"
          className="rounded-full bg-primary px-5 py-2.5 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Sign in
        </Link>
        <Link
          href="/upload"
          className="rounded-full border border-border px-5 py-2.5 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Upload
        </Link>
        <Link
          href="/library"
          className="rounded-full border border-border px-5 py-2.5 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Library
        </Link>
      </nav>
    </section>
  );
}
