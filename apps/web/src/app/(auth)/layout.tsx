import { AuthNavLinks } from "@/components/auth-nav";
import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-2">
      <nav aria-label="Account" className="w-full">
        <AuthNavLinks />
      </nav>
      {children}
    </div>
  );
}
