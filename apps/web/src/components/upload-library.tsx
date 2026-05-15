"use client";

import { CircleAlert, Headphones, Loader2, Music2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { HlsAudioPlayer } from "@/components/hls-audio-player";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { deriveHlsMasterKeyFromUploadKey, joinPublicObjectUrl } from "@/lib/upload-hls";
import { cn } from "@/lib/utils";

export type LibraryUploadRow = {
  id: string;
  key: string;
  filename: string;
  status: "uploading" | "processing" | "ready" | "failed";
  publicUrl: string;
  createdAt: string;
};

type Props = {
  uploads: LibraryUploadRow[];
  r2PublicBaseUrl: string;
};

function StatusPill({
  status,
}: {
  status: LibraryUploadRow["status"];
}) {
  const label =
    status === "uploading"
      ? "Uploading"
      : status === "processing"
        ? "Processing"
        : status === "ready"
          ? "Ready"
          : "Failed";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        status === "failed" && "border-destructive/30 bg-destructive/10 text-destructive",
        status === "ready" && "border-border bg-muted text-foreground",
        (status === "uploading" || status === "processing") &&
          "border-border bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function formatCreatedAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function UploadLibrary({ uploads, r2PublicBaseUrl }: Props) {
  const router = useRouter();

  if (uploads.length === 0) {
    return (
      <Card className="w-full border-dashed shadow-none ring-border/60">
        <CardHeader className="text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <Music2 className="size-6 text-muted-foreground" aria-hidden />
          </div>
          <CardTitle className="text-balance pt-2">No uploads yet</CardTitle>
          <CardDescription className="text-pretty">
            Upload an audio file to see it here. When processing finishes, you can stream it as HLS.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center pb-6">
          <Button asChild size="lg">
            <Link href="/upload">Go to upload</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <ul className="flex w-full flex-col gap-4" aria-label="Your uploads">
      {uploads.map((u, index) => {
        const masterKey = deriveHlsMasterKeyFromUploadKey(u.key);
        const hlsUrl =
          masterKey !== null ? joinPublicObjectUrl(r2PublicBaseUrl, masterKey) : u.publicUrl;

        const playerLabel = `${u.filename}, upload ${index + 1}`;

        return (
          <li key={u.id}>
            <Card className="overflow-hidden shadow-xs transition-shadow duration-200 hover:shadow-md">
              <CardHeader className="gap-3 border-b border-border/60 pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted ring-1 ring-border">
                      <Headphones className="size-5 text-muted-foreground" aria-hidden />
                    </span>
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="truncate text-pretty">{u.filename}</CardTitle>
                      <CardDescription className="text-pretty">
                        Added {formatCreatedAt(u.createdAt)}
                      </CardDescription>
                    </div>
                  </div>
                  <StatusPill status={u.status} />
                </div>
              </CardHeader>

              <CardContent className="pt-6">
                {u.status === "uploading" || u.status === "processing" ? (
                  <div
                    className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-10 text-center transition-colors duration-200"
                    aria-busy="true"
                  >
                    <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {u.status === "uploading" ? "Finishing upload…" : "Processing audio…"}
                      </p>
                      <p className="text-pretty text-sm text-muted-foreground">
                        This usually takes a moment. You can refresh to load the latest status.
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1"
                        onClick={() => router.refresh()}
                      >
                        Refresh status
                      </Button>
                    </div>
                  </div>
                ) : null}

                {u.status === "failed" ? (
                  <div className="flex flex-col gap-4 rounded-lg border border-destructive/25 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-3">
                      <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">Something went wrong</p>
                        <p className="text-pretty text-sm text-muted-foreground">
                          This upload could not be processed. Try uploading again from the upload page.
                        </p>
                      </div>
                    </div>
                    <Button asChild variant="outline" className="shrink-0">
                      <Link href="/upload">Upload again</Link>
                    </Button>
                  </div>
                ) : null}

                {u.status === "ready" ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Stream</p>
                    <HlsAudioPlayer hlsUrl={hlsUrl} fallbackUrl={u.publicUrl} label={playerLabel} />
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
