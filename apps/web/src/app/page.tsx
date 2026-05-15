import Link from "next/link";

export default function Home() {
  return (
    <section className="flex w-full max-w-lg flex-col items-center gap-8 text-center">
      <h1 className="font-heading text-balance text-3xl font-semibold tracking-tight text-foreground">
        Vessel
      </h1>
      <p className="text-pretty text-sm text-muted-foreground">
        Upload audio, process it in the cloud, and stream adaptive HLS from your library.
      </p>
      <nav aria-label="Primary" className="flex flex-wrap items-center justify-center gap-4 text-sm font-medium">
        <Link
          href="/login"
          className="text-primary underline-offset-4 transition-colors hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Sign in
        </Link>
        <Link
          href="/upload"
          className="text-primary underline-offset-4 transition-colors hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Upload
        </Link>
        <Link
          href="/library"
          className="text-primary underline-offset-4 transition-colors hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Library
        </Link>
      </nav>
    </section>
  );
}
