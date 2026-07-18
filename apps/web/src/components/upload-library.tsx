"use client";

import { CircleAlert, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { HlsAudioPlayer } from "@/components/hls-audio-player";
import { Button } from "@/components/ui/button";
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
  initialSelectedId?: string;
};

function formatCreatedAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function StatusChip({ status }: { status: LibraryUploadRow["status"] }) {
  if (status === "ready") {
    return (
      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground">
        Ready
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium tracking-wide text-destructive">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium tracking-wide text-primary">
      <Loader2 className="size-3 animate-spin" aria-hidden />
      {status === "uploading" ? "Uploading" : "Processing"}
    </span>
  );
}

export function UploadLibrary({ uploads, r2PublicBaseUrl, initialSelectedId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const prevStatuses = useRef<Map<string, LibraryUploadRow["status"]> | null>(null);

  const pending = useMemo(
    () => uploads.filter((u) => u.status === "uploading" || u.status === "processing"),
    [uploads],
  );

  const sorted = useMemo(
    () =>
      [...uploads].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [uploads],
  );

  useEffect(() => {
    if (pending.length === 0) return;
    const timer = window.setInterval(() => {
      router.refresh();
    }, 7000);
    return () => {
      window.clearInterval(timer);
    };
  }, [pending.length, router]);

  useEffect(() => {
    const prev = prevStatuses.current;
    if (prev) {
      for (const upload of uploads) {
        const prior = prev.get(upload.id);
        if (!prior || prior === upload.status) continue;
        if (upload.status === "ready") {
          toast.success(`${upload.filename} is ready to play.`);
        } else if (upload.status === "failed") {
          toast.error(`${upload.filename} failed to process.`);
        }
      }
    }
    prevStatuses.current = new Map(uploads.map((u) => [u.id, u.status]));
  }, [uploads]);

  if (uploads.length === 0) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Your library is empty
          </h1>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            Upload a track — processing usually takes up to about 5 minutes, then it lands here.
          </p>
        </div>
        <Button asChild size="lg" className="rounded-full px-8">
          <Link href="/upload">Add music</Link>
        </Button>
      </div>
    );
  }

  const selected = uploads.find((u) => u.id === selectedId) ?? sorted[0];
  const handleSelect = (id: string) => {
    setSelectedId(id);
    const next = new URLSearchParams(searchParams.toString());
    next.set("selected", id);
    next.delete("uploadId");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const masterKey = deriveHlsMasterKeyFromUploadKey(selected.key);
  const hlsUrl =
    masterKey !== null ? joinPublicObjectUrl(r2PublicBaseUrl, masterKey) : selected.publicUrl;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col pb-28">
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
          Library
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {uploads.length} {uploads.length === 1 ? "track" : "tracks"}
          {pending.length > 0
            ? ` · ${pending.length} processing (usually up to about 5 minutes)`
            : null}
        </p>
      </header>

      <ul className="flex flex-col gap-0.5" aria-label="Tracks">
        {sorted.map((upload) => {
          const active = upload.id === selected.id;
          return (
            <li key={upload.id}>
              <button
                type="button"
                onClick={() => handleSelect(upload.id)}
                className={cn(
                  "relative flex w-full touch-manipulation items-center gap-3 rounded-lg py-3 pr-3 pl-4 text-left transition-colors duration-150",
                  active
                    ? "bg-muted/50 text-foreground before:absolute before:top-1/2 before:left-0 before:h-8 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary"
                    : "text-foreground/88 hover:bg-muted/30 hover:text-foreground",
                )}
              >
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate font-medium leading-snug",
                      active ? "text-foreground" : "text-foreground/90",
                    )}
                  >
                    {upload.filename}
                  </span>
                  <span className="mt-0.5 block truncate text-xs leading-tight text-muted-foreground">
                    {formatCreatedAt(upload.createdAt)}
                  </span>
                </div>
                <StatusChip status={upload.status} />
              </button>
            </li>
          );
        })}
      </ul>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm supports-backdrop-filter:bg-background/85"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto w-full max-w-2xl">
          {selected.status === "uploading" || selected.status === "processing" ? (
            <div className="flex items-center gap-3" aria-busy="true">
              <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{selected.filename}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {selected.status === "uploading"
                    ? "Finishing upload…"
                    : "Processing — usually up to about 5 minutes"}
                </p>
              </div>
            </div>
          ) : selected.status === "failed" ? (
            <div className="flex items-center gap-3">
              <CircleAlert className="size-5 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{selected.filename}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Processing failed — try uploading again
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="h-8 shrink-0">
                <Link href="/upload">Upload</Link>
              </Button>
            </div>
          ) : (
            <HlsAudioPlayer
              key={selected.id}
              variant="dock"
              hlsUrl={hlsUrl}
              fallbackUrl={selected.publicUrl}
              label={selected.filename}
              title={selected.filename}
              subtitle={`Added ${formatCreatedAt(selected.createdAt)}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
