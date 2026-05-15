import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-8">
      <nav
        aria-label="Account"
        className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"
      >
        <div className="flex flex-wrap gap-6 text-sm font-medium">
          <Link
            href="/upload"
            className="text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Upload
          </Link>
          <Link
            href="/library"
            className="text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Library
          </Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
