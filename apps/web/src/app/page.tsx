import Link from "next/link";

export default function Home() {
  return (
    <section className="flex w-full max-w-2xl flex-col items-center justify-center py-16 sm:py-24">
      <h1 className="font-heading text-center text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
        Vessel
      </h1>
      <p className="mx-auto mt-5 max-w-md text-center text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
        Upload once, stream everywhere.
      </p>
      <p className="mx-auto mt-3 max-w-sm text-center text-pretty text-sm leading-relaxed text-muted-foreground">
        Adaptive audio from a single file — processing usually takes up to about 5 minutes.
      </p>
      <div className="mt-10">
        <Link
          href="/login"
          className="inline-flex rounded-full bg-primary px-7 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Sign in
        </Link>
      </div>
    </section>
  );
}
