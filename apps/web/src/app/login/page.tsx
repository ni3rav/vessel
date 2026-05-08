import { Login } from "@/components/login";
import { Suspense } from "react";

function LoginFallback() {
  return (
    <section className="w-full max-w-sm rounded-xl p-6">
      <p className="text-center text-sm text-muted-foreground">Loading login...</p>
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <Login />
    </Suspense>
  );
}
