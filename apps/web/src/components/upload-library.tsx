"use client";

import { CircleAlert, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { HlsAudioPlayer } from "@/components/hls-audio-player";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

function formatCreatedAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function LibraryTrackRow({
  upload,
  active,
  onSelect,
}: {
  upload: LibraryUploadRow;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "relative flex w-full touch-manipulation flex-col gap-0 rounded-lg py-2 pr-2 pl-4 text-left transition-colors duration-150",
          active
            ? "text-foreground before:absolute before:top-1/2 before:left-0 before:h-7 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary"
            : "text-foreground/88 hover:text-foreground",
        )}
      >
        <div className="flex min-w-0 flex-col gap-0">
          <span className={cn("block truncate font-medium leading-snug", active ? "text-foreground" : "text-foreground/90")}>
            {upload.filename}
          </span>
          <span className="block truncate text-xs leading-tight text-muted-foreground">{formatCreatedAt(upload.createdAt)}</span>
        </div>
      </button>
    </li>
  );
}

export function UploadLibrary({ uploads, r2PublicBaseUrl }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const pending = useMemo(
    () => uploads.filter((u) => u.status === "uploading" || u.status === "processing"),
    [uploads],
  );
  const ready = useMemo(() => uploads.filter((u) => u.status === "ready"), [uploads]);
  const failed = useMemo(() => uploads.filter((u) => u.status === "failed"), [uploads]);

  const defaultAccordionValues = useMemo(() => {
    const values: string[] = [];
    if (pending.length) values.push("processing");
    if (ready.length) values.push("ready");
    if (failed.length && pending.length === 0 && ready.length === 0) values.push("failed");
    return values;
  }, [pending.length, ready.length, failed.length]);

  if (uploads.length === 0) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Your library is empty</h1>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            Upload a track — when it&apos;s ready, it&apos;ll land here with adaptive streaming.
          </p>
        </div>
        <Button asChild size="lg" className="rounded-full px-8">
          <Link href="/upload">Add music</Link>
        </Button>
      </div>
    );
  }

  const selected = uploads.find((u) => u.id === selectedId) ?? uploads[0];

  const masterKey = deriveHlsMasterKeyFromUploadKey(selected.key);
  const hlsUrl =
    masterKey !== null ? joinPublicObjectUrl(r2PublicBaseUrl, masterKey) : selected.publicUrl;

  const playerLabel = selected.filename;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <section aria-labelledby="now-playing-heading" className="flex w-full min-w-0 flex-col">
        <p
          id="now-playing-heading"
          className="mb-3 font-heading text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Now playing
        </p>

        {selected.status === "uploading" || selected.status === "processing" ? (
          <div
            className="flex flex-col gap-4 rounded-lg border border-border bg-muted/30 px-4 py-5 text-center sm:flex-row sm:items-center sm:text-left"
            aria-busy="true"
          >
            <Loader2 className="mx-auto size-9 shrink-0 animate-spin text-primary sm:mx-0" aria-hidden />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-heading text-base font-semibold text-foreground">
                {selected.status === "uploading" ? "Finishing upload" : "Processing"}
              </p>
              <p className="text-pretty text-sm text-muted-foreground">
                This usually finishes quickly. Status updates automatically every 7 seconds.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() => router.refresh()}
              >
                Refresh status
              </Button>
            </div>
          </div>
        ) : selected.status === "failed" ? (
          <div className="flex flex-col gap-4 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-5 sm:flex-row sm:items-start">
            <CircleAlert className="mx-auto size-9 shrink-0 text-destructive/90 sm:mx-0" aria-hidden />
            <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
              <p className="font-heading text-base font-semibold text-foreground">Couldn&apos;t process this one</p>
              <p className="text-pretty text-sm text-muted-foreground">
                Nothing&apos;s wrong on your side — try uploading again whenever you like.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-1">
                <Link href="/upload">Upload again</Link>
              </Button>
            </div>
          </div>
        ) : (
          <HlsAudioPlayer
            key={selected.id}
            hlsUrl={hlsUrl}
            fallbackUrl={selected.publicUrl}
            label={playerLabel}
            title={selected.filename}
            subtitle={`Added ${formatCreatedAt(selected.createdAt)}`}
          />
        )}
      </section>

      <aside className="flex w-full flex-col border-t border-border pt-6">
        <h2 className="font-heading text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Library
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {uploads.length} {uploads.length === 1 ? "item" : "items"}
        </p>

        <div className="mt-4 max-h-[min(28rem,52dvh)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] pr-1">
          <Accordion
            type="multiple"
            defaultValue={defaultAccordionValues}
            className="flex w-full flex-col gap-2 pb-2"
            aria-label="Library by status"
          >
            {pending.length > 0 ? (
              <AccordionItem value="processing" className="border-0 px-0">
                <AccordionTrigger className="rounded-lg px-2 py-2.5 text-left text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase hover:no-underline">
                  <span className="flex flex-wrap items-baseline gap-x-1">
                    <span>Processing</span>
                    <span className="font-normal tracking-normal text-foreground tabular-nums">
                      · {pending.length}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-0 pb-2">
                  <ul className="flex flex-col gap-1">
                    {pending.map((u) => (
                      <LibraryTrackRow
                        key={u.id}
                        upload={u}
                        active={u.id === selectedId}
                        onSelect={() => setSelectedId(u.id)}
                      />
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ) : null}

            {ready.length > 0 ? (
              <AccordionItem value="ready" className="border-0 px-0">
                <AccordionTrigger className="rounded-lg px-2 py-2.5 text-left text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase hover:no-underline">
                  <span className="flex flex-wrap items-baseline gap-x-1">
                    <span>Ready</span>
                    <span className="font-normal tracking-normal text-foreground tabular-nums">
                      · {ready.length}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-0 pb-2">
                  <ul className="flex flex-col gap-1">
                    {ready.map((u) => (
                      <LibraryTrackRow
                        key={u.id}
                        upload={u}
                        active={u.id === selectedId}
                        onSelect={() => setSelectedId(u.id)}
                      />
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ) : null}

            {failed.length > 0 ? (
              <AccordionItem value="failed" className="border-0 px-0">
                <AccordionTrigger className="rounded-lg px-2 py-2.5 text-left text-xs font-semibold tracking-[0.18em] text-destructive/90 uppercase hover:no-underline">
                  <span className="flex flex-wrap items-baseline gap-x-1">
                    <span>Failed</span>
                    <span className="font-normal tracking-normal text-foreground tabular-nums">
                      · {failed.length}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-0 pb-2">
                  <p className="mb-3 border-l-2 border-destructive/35 pl-3 text-pretty text-[11px] leading-relaxed text-muted-foreground">
                    These entries are only shown temporarily and may be removed automatically when we clean things
                    up. Try{" "}
                    <Link
                      href="/upload"
                      className="font-medium text-foreground underline-offset-4 transition-colors hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      uploading again
                    </Link>{" "}
                    if you still need the file.
                  </p>
                  <ul className="flex flex-col gap-1">
                    {failed.map((u) => (
                      <LibraryTrackRow
                        key={u.id}
                        upload={u}
                        active={u.id === selectedId}
                        onSelect={() => setSelectedId(u.id)}
                      />
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ) : null}
          </Accordion>
        </div>
      </aside>
    </div>
  );
}
