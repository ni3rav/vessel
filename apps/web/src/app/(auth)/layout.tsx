import { AuthNavLinks } from "@/components/auth-nav";
import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2 xl:max-w-7xl">
      <nav
        aria-label="Account"
        className="rounded-full border border-border/70 bg-muted/20 px-4 py-2.5 sm:px-6"
      >
        <AuthNavLinks />
      </nav>
      {children}
    </div>
  );
}
