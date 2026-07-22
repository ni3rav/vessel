"use client";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { JSX, SVGProps, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

const GitHubIcon = (props: JSX.IntrinsicAttributes & SVGProps<SVGSVGElement>) => (
  <svg fill="currentColor" viewBox="0 0 24 24" {...props}>
    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.579.688.481C19.137 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
  </svg>
);

function GitHubSignInButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      variant="outline"
      className="inline-flex w-full items-center justify-center space-x-2"
      type="submit"
      disabled={pending}
    >
      <GitHubIcon className="size-5" aria-hidden={true} />
      <span className="text-sm font-medium">
        {pending ? "Redirecting..." : "Continue with GitHub"}
      </span>
    </Button>
  );
}

export function Login() {
  const router = useRouter();
  const { data: session } = authClient.useSession();

  useEffect(() => {
    if (session) {
      router.replace("/library");
    }
  }, [session, router]);

  const signInWithGitHub = async () => {
    await authClient.signIn.social({
      provider: "github",
      callbackURL: "/library",
    });
  };

  return (
    <section className="w-full max-w-md">
      <div className="mb-8 space-y-2 text-center">
        <p className="font-heading text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">Welcome</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Sign in to Vessel</h1>
        <p className="text-sm text-muted-foreground">Continue with GitHub to access upload and library.</p>
      </div>
      <form action={signInWithGitHub}>
        <GitHubSignInButton />
      </form>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        We only use your account for authentication.
      </p>
    </section>
  );
}
