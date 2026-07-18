"use client";

import { CircleAlert, Loader2, SkipBack, SkipForward } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { HlsAudioPlayer, type HlsPlayerControls } from "@/components/hls-audio-player";
import { KeyboardShortcutsHint } from "@/components/keyboard-shortcuts-hint";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { tryCatch } from "@/lib/try-catch";
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
  const label =
    status === "ready"
      ? "Ready"
      : status === "failed"
        ? "Failed"
        : status === "uploading"
          ? "Uploading"
          : "Processing";

  return (
    <span
      className={cn(
        "inline-flex h-6 w-[6.75rem] shrink-0 items-center justify-center gap-1 rounded-full px-2 text-[11px] font-medium tracking-wide",
        status === "ready" && "bg-muted text-muted-foreground",
        status === "failed" && "bg-destructive/10 text-destructive",
        (status === "processing" || status === "uploading") && "bg-primary/10 text-primary",
      )}
    >
      {(status === "processing" || status === "uploading") && (
        <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

function DockSkipControls({
  canPrevious,
  canNext,
  onPrevious,
  onNext,
}: {
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9 rounded-full"
        aria-label="Previous track"
        disabled={!canPrevious}
        onClick={onPrevious}
      >
        <SkipBack className="size-4 fill-current" aria-hidden />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9 rounded-full"
        aria-label="Next track"
        disabled={!canNext}
        onClick={onNext}
      >
        <SkipForward className="size-4 fill-current" aria-hidden />
      </Button>
    </div>
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function UploadLibrary({ uploads, r2PublicBaseUrl, initialSelectedId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const prevStatuses = useRef<Map<string, LibraryUploadRow["status"]> | null>(null);
  const playerControlsRef = useRef<HlsPlayerControls | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

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

  const selected = selectedId ? (uploads.find((u) => u.id === selectedId) ?? null) : null;

  const sortedIndex = selected ? sorted.findIndex((u) => u.id === selected.id) : -1;
  const previousReady =
    sortedIndex > 0
      ? sorted.slice(0, sortedIndex).reverse().find((u) => u.status === "ready")
      : undefined;
  const nextReady =
    sortedIndex >= 0
      ? sorted.slice(sortedIndex + 1).find((u) => u.status === "ready")
      : undefined;
  const canPrevious = Boolean(previousReady);
  const canNext = Boolean(nextReady);

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

  const syncSelectedQuery = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("uploadId");
      if (id) next.set("selected", id);
      else next.delete("selected");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      syncSelectedQuery(id);
      rowRefs.current.get(id)?.scrollIntoView({ block: "nearest" });
    },
    [syncSelectedQuery],
  );

  const goPrevious = useCallback(() => {
    if (previousReady) handleSelect(previousReady.id);
  }, [handleSelect, previousReady]);

  const goNext = useCallback(() => {
    if (nextReady) handleSelect(nextReady.id);
  }, [handleSelect, nextReady]);

  const moveListSelection = useCallback(
    (delta: number) => {
      if (sorted.length === 0) return;
      const current = selectedId ? sorted.findIndex((u) => u.id === selectedId) : -1;
      const nextIndex =
        current < 0
          ? delta > 0
            ? 0
            : sorted.length - 1
          : Math.min(sorted.length - 1, Math.max(0, current + delta));
      const next = sorted[nextIndex];
      if (next) handleSelect(next.id);
    },
    [handleSelect, selectedId, sorted],
  );

  const handleDelete = useCallback(
    async (upload: LibraryUploadRow) => {
      const { data: res, error } = await tryCatch(
        fetch(`/api/upload/${encodeURIComponent(upload.id)}`, { method: "DELETE" }),
      );
      if (error || !res) {
        toast.error("Could not delete track.");
        return;
      }
      if (!res.ok) {
        const msg = await res.text();
        toast.error(msg || "Could not delete track.");
        return;
      }

      toast.success("Permanently deleted");
      if (selectedId === upload.id) {
        setSelectedId(null);
        syncSelectedQuery(null);
      }
      router.refresh();
    },
    [router, selectedId, syncSelectedQuery],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const key = event.key;
      const lower = key.toLowerCase();

      if (key === "?" || (event.shiftKey && key === "/")) {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      if (lower === "j") {
        event.preventDefault();
        goPrevious();
        return;
      }
      if (lower === "k") {
        event.preventDefault();
        goNext();
        return;
      }
      if (key === "ArrowUp") {
        event.preventDefault();
        moveListSelection(-1);
        return;
      }
      if (key === "ArrowDown") {
        event.preventDefault();
        moveListSelection(1);
        return;
      }
      if (key === "Enter" && selected?.status === "ready") {
        event.preventDefault();
        playerControlsRef.current?.togglePlay();
        return;
      }
      if (key === " " && selected?.status === "ready") {
        event.preventDefault();
        playerControlsRef.current?.togglePlay();
        return;
      }
      if (key === "ArrowLeft" && selected?.status === "ready") {
        event.preventDefault();
        playerControlsRef.current?.seekBy(-5);
        return;
      }
      if (key === "ArrowRight" && selected?.status === "ready") {
        event.preventDefault();
        playerControlsRef.current?.seekBy(5);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrevious, moveListSelection, selected?.status]);

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

  const masterKey = selected ? deriveHlsMasterKeyFromUploadKey(selected.key) : null;
  const hlsUrl =
    selected && masterKey !== null
      ? joinPublicObjectUrl(r2PublicBaseUrl, masterKey)
      : selected?.publicUrl ?? "";

  return (
    <div className="flex w-full flex-col pb-28">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {uploads.length} {uploads.length === 1 ? "track" : "tracks"}
            {pending.length > 0
              ? ` · ${pending.length} processing (usually up to about 5 minutes)`
              : null}
          </p>
        </div>
        <KeyboardShortcutsHint open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      </header>

      <ScrollArea className="h-[min(28rem,52dvh)] rounded-xl border border-border/60">
        <ul className="flex flex-col gap-0.5 p-2" aria-label="Tracks">
          {sorted.map((upload) => {
            const active = selected?.id === upload.id;
            const deleteDisabled =
              upload.status === "processing" || upload.status === "uploading";
            return (
              <li
                key={upload.id}
                ref={(node) => {
                  if (node) rowRefs.current.set(upload.id, node);
                  else rowRefs.current.delete(upload.id);
                }}
              >
                <div
                  className={cn(
                    "relative grid w-full grid-cols-[minmax(0,1fr)_6.75rem_2rem] items-center gap-2 rounded-lg py-2 pr-2 pl-4 transition-colors duration-150",
                    active
                      ? "bg-muted/50 text-foreground before:absolute before:top-1/2 before:left-0 before:h-8 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary"
                      : "text-foreground/88 hover:bg-muted/30 hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(upload.id)}
                    className="min-w-0 touch-manipulation py-1 text-left"
                  >
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
                  </button>
                  <div className="flex justify-end">
                    <StatusChip status={upload.status} />
                  </div>
                  <div className="flex justify-end">
                    <ConfirmDeleteButton
                      disabled={deleteDisabled}
                      onConfirm={() => handleDelete(upload)}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm supports-backdrop-filter:bg-background/85"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto w-full max-w-2xl">
          {!selected ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              Select a track to play
            </p>
          ) : selected.status === "uploading" || selected.status === "processing" ? (
            <div className="flex items-center gap-3" aria-busy="true">
              <DockSkipControls
                canPrevious={canPrevious}
                canNext={canNext}
                onPrevious={goPrevious}
                onNext={goNext}
              />
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
              <DockSkipControls
                canPrevious={canPrevious}
                canNext={canNext}
                onPrevious={goPrevious}
                onNext={goNext}
              />
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
              onPrevious={goPrevious}
              onNext={goNext}
              canPrevious={canPrevious}
              canNext={canNext}
              controlsRef={playerControlsRef}
            />
          )}
        </div>
      </div>
    </div>
  );
}
