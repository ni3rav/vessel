import { Login } from "@/components/login";
import { requireGuest } from "@/lib/auth-guard";
import { Suspense } from "react";

function LoginFallback() {
  return (
    <section className="w-full max-w-md rounded-2xl border border-border/70 bg-muted/20 px-6 py-10">
      <p className="text-center text-sm text-muted-foreground">Loading login...</p>
    </section>
  );
}

export default async function LoginPage() {
  await requireGuest("/library");

  return (
    <Suspense fallback={<LoginFallback />}>
      <Login />
    </Suspense>
  );
}
