"use client";

import { Loader2, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { KeyboardShortcutsHint } from "@/components/keyboard-shortcuts-hint";
import { usePlaybackSession } from "@/components/playback/playback-provider";
import type { PlaybackTrack } from "@/components/playback/playback-provider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TrackList,
  TrackListItem,
  TrackListItemActions,
  TrackListItemContent,
  TrackListItemDescription,
  TrackListItemIndex,
  TrackListItemTitle,
} from "@/components/ui/track-list";
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

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = text.toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
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
        (status === "processing" || status === "uploading") && "bg-primary/10 text-primary"
      )}
    >
      {(status === "processing" || status === "uploading") && (
        <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

function toPlaybackTrack(row: LibraryUploadRow, baseUrl: string): PlaybackTrack {
  const masterKey = deriveHlsMasterKeyFromUploadKey(row.key);
  return {
    fallbackUrl: row.publicUrl,
    hlsUrl: masterKey ? joinPublicObjectUrl(baseUrl, masterKey) : row.publicUrl,
    id: row.id,
    status: row.status,
    subtitle: `Added ${formatCreatedAt(row.createdAt)}`,
    title: row.filename,
  };
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
  const playback = usePlaybackSession();
  const { load, subscribeSkip, syncLibrary, dismiss, track: activeTrack } = playback;
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [query, setQuery] = useState("");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null);
  const prevStatuses = useRef<Map<string, LibraryUploadRow["status"]> | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const boot = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const clearDeleteArmed = useCallback(() => setDeleteArmedId(null), []);

  const pending = useMemo(
    () => uploads.filter((u) => u.status === "uploading" || u.status === "processing"),
    [uploads]
  );

  const sorted = useMemo(
    () =>
      [...uploads].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [uploads]
  );

  const filtered = useMemo(
    () => sorted.filter((u) => fuzzyMatch(query, u.filename)),
    [query, sorted]
  );

  const selected = selectedId ? (uploads.find((u) => u.id === selectedId) ?? null) : null;
  const playingId = activeTrack?.id ?? null;

  useEffect(() => {
    syncLibrary(sorted.map((row) => toPlaybackTrack(row, r2PublicBaseUrl)));
  }, [r2PublicBaseUrl, sorted, syncLibrary]);

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
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (boot.current) return;
    if (activeTrack) {
      boot.current = true;
      return;
    }
    if (sorted.length === 0) return;
    boot.current = true;
    const row = sorted.find((item) => item.id === initialSelectedId) ?? sorted[0];
    if (!row) return;
    load(toPlaybackTrack(row, r2PublicBaseUrl), { quiet: true });
  }, [activeTrack, initialSelectedId, load, r2PublicBaseUrl, sorted]);

  useEffect(() => {
    return subscribeSkip((id) => {
      setSelectedId(id);
      setDeleteArmedId(null);
      syncSelectedQuery(id);
      rowRefs.current.get(id)?.scrollIntoView({ block: "nearest" });
    });
  }, [subscribeSkip, syncSelectedQuery]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setDeleteArmedId(null);
      syncSelectedQuery(id);
      rowRefs.current.get(id)?.scrollIntoView({ block: "nearest" });
    },
    [syncSelectedQuery]
  );

  const playTrack = useCallback(
    (id: string) => {
      const track = uploads.find((u) => u.id === id);
      if (!track || track.status !== "ready") return;
      load(toPlaybackTrack(track, r2PublicBaseUrl), { toggleIfSame: true });
      setSelectedId(id);
      setDeleteArmedId(null);
      syncSelectedQuery(id);
    },
    [load, r2PublicBaseUrl, syncSelectedQuery, uploads]
  );

  const moveListSelection = useCallback(
    (delta: number) => {
      if (filtered.length === 0) return;
      const current = selectedId ? filtered.findIndex((u) => u.id === selectedId) : -1;
      const nextIndex =
        current < 0
          ? delta > 0
            ? 0
            : filtered.length - 1
          : Math.min(filtered.length - 1, Math.max(0, current + delta));
      const next = filtered[nextIndex];
      if (next) handleSelect(next.id);
    },
    [filtered, handleSelect, selectedId]
  );

  const handleDelete = useCallback(
    async (upload: LibraryUploadRow) => {
      const { data: res, error } = await tryCatch(
        fetch(`/api/upload/${encodeURIComponent(upload.id)}`, { method: "DELETE" })
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
      setDeleteArmedId(null);
      if (selectedId === upload.id) {
        setSelectedId(null);
        syncSelectedQuery(null);
      }
      dismiss(upload.id);
      router.refresh();
    },
    [dismiss, router, selectedId, syncSelectedQuery]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const key = event.key;

      if (key === "?" || (event.shiftKey && key === "/")) {
        event.preventDefault();
        setShortcutsOpen((open) => !open);
        return;
      }

      const inTrackList =
        event.target instanceof HTMLElement &&
        Boolean(event.target.closest("[data-slot='track-list']"));
      if (inTrackList && (key === "ArrowUp" || key === "ArrowDown")) {
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("button") &&
        (key === "Enter" || key === " ")
      ) {
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
        playTrack(selected.id);
        return;
      }
      if ((key === "Delete" || key === "Backspace") && selected) {
        const canDelete = selected.status === "ready" || selected.status === "failed";
        if (!canDelete) return;
        event.preventDefault();
        if (deleteArmedId !== selected.id) {
          setDeleteArmedId(selected.id);
          return;
        }
        void handleDelete(selected);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteArmedId, handleDelete, moveListSelection, playTrack, selected]);

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

  return (
    <div className="flex w-full flex-col">
      <header className="mb-4 flex items-start justify-between gap-3">
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

      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tracks…"
          aria-label="Search tracks"
          className="h-10 w-full rounded-xl border border-border bg-muted/30 pr-9 pl-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {query ? (
          <button
            type="button"
            className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      <ScrollArea className="h-[min(28rem,52dvh)] rounded-xl border border-border/60">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            No tracks match “{query.trim()}”
          </p>
        ) : (
          <TrackList aria-label="Tracks" className="p-2">
            {filtered.map((upload, index) => {
              const isSelected = selected?.id === upload.id;
              const isPlaying = playingId === upload.id;
              const deleteDisabled =
                upload.status === "processing" || upload.status === "uploading";
              return (
                <TrackListItem
                  key={upload.id}
                  active={isSelected}
                  playing={isPlaying && upload.status === "ready"}
                  className={cn(
                    isSelected &&
                      "before:absolute before:top-1/2 before:left-0 before:h-8 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary"
                  )}
                  ref={(node) => {
                    if (node) rowRefs.current.set(upload.id, node);
                    else rowRefs.current.delete(upload.id);
                  }}
                  onSelect={() => handleSelect(upload.id)}
                  onFocus={(event) => {
                    if (event.target !== event.currentTarget) return;
                    handleSelect(upload.id);
                  }}
                  onDoubleClick={(event) => {
                    const target = event.target;
                    if (target instanceof HTMLElement && target.closest("button")) return;
                    playTrack(upload.id);
                  }}
                >
                  <TrackListItemIndex>{index + 1}</TrackListItemIndex>
                  <TrackListItemContent>
                    <TrackListItemTitle>{upload.filename}</TrackListItemTitle>
                    <TrackListItemDescription>
                      {formatCreatedAt(upload.createdAt)}
                    </TrackListItemDescription>
                  </TrackListItemContent>
                  <TrackListItemActions>
                    <StatusChip status={upload.status} />
                    <ConfirmDeleteButton
                      disabled={deleteDisabled}
                      armed={deleteArmedId === upload.id}
                      onArm={() => setDeleteArmedId(upload.id)}
                      onDisarm={clearDeleteArmed}
                      onConfirm={() => handleDelete(upload)}
                    />
                  </TrackListItemActions>
                </TrackListItem>
              );
            })}
          </TrackList>
        )}
      </ScrollArea>
    </div>
  );
}
