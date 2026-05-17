import type { Metadata } from "next";
import { Geist, Geist_Mono, Nunito_Sans, Noto_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";

const notoSansHeading = Noto_Sans({ subsets: ["latin"], variable: "--font-heading" });

const nunitoSans = Nunito_Sans({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vessel",
  description: "Upload audio, process in the cloud, and stream from your library.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        nunitoSans.variable,
        notoSansHeading.variable
      )}
    >
      <body className="min-h-dvh bg-background text-foreground">
        <main className="mx-auto flex min-h-dvh w-full max-w-7xl items-start justify-center px-4 py-8 sm:py-10">
          {children}
        </main>
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          visibleToasts={4}
          toastOptions={{
            duration: 3500,
          }}
        />
      </body>
    </html>
  );
}
