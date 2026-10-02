import { AuthNavLinks } from "@/components/auth-nav";
import { PlaybackDock } from "@/components/playback/playback-dock";
import { PlaybackProvider } from "@/components/playback/playback-provider";
import type { ReactNode } from "react";

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <PlaybackProvider>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pt-2 pb-[calc(14rem+env(safe-area-inset-bottom))] sm:pb-[calc(9rem+env(safe-area-inset-bottom))]">
        <nav aria-label="Account" className="w-full">
          <AuthNavLinks />
        </nav>
        {children}
      </div>
      <PlaybackDock />
    </PlaybackProvider>
  );
}
