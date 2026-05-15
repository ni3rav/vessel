"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/upload", label: "Upload" },
  { href: "/library", label: "Library" },
] as const;

export function AuthNavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-8 text-sm font-medium tracking-wide">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "transition-colors focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
