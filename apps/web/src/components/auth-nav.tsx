"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/library", label: "Library" },
  { href: "/upload", label: "Upload" },
] as const;

export function AuthNavLinks() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium tracking-wide">
        {LINKS.map(({ href, label }) => {
          const active = pathname === href;

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full text-muted-foreground"
        disabled={signingOut}
        onClick={() => void signOut()}
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
