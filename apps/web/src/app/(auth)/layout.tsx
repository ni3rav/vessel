import { AuthNavLinks } from "@/components/auth-nav";
import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2 xl:max-w-7xl">
      <nav aria-label="Account" className="px-1 sm:px-0">
        <AuthNavLinks />
      </nav>
      {children}
    </div>
  );
}
