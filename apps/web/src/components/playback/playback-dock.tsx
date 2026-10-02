"use client";

import {
  AlertCircle,
  Pause,
  Play,
  Settings2,
  SkipBack,
  SkipForward,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Ref } from "react";

import { usePlaybackClock, usePlaybackSession } from "@/components/playback/playback-provider";
import type { PlaybackEngine, QualityChoice } from "@/components/playback/playback-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Waveform, WaveformCanvas, WaveformCursor } from "@/components/ui/waveform";
import { useWaveformData } from "@/hooks/use-waveform-data";
import { formatTime } from "@/lib/audio/time";
import { cn } from "@/lib/utils";

/** Strong ease-out from Emil Kowalski’s animation notes. Enter/exit only. */
const EASE_OUT = "ease-[cubic-bezier(0.23,1,0.32,1)]";
const MORPH =
  "origin-bottom transition-[transform,opacity] duration-200 " +
  EASE_OUT +
  " motion-reduce:transform-none motion-reduce:transition-opacity motion-reduce:duration-150";

const SURFACE = "border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl";

function shortQuality(label: string) {
  if (label === "Original") return "File";
  if (label === "Adaptive" || label.startsWith("Auto")) return "Auto";
  const match = /(\d+)/.exec(label);
  return match ? `${match[1]}k` : label.slice(0, 6);
}

function qualityText(
  engine: PlaybackEngine,
  choice: QualityChoice,
  bitrate: number,
  levels: { index: number; label: string; bitrate: number }[]
) {
  if (engine === "native-hls") return "Adaptive";
  if (engine === "direct") return "Original";
  if (engine !== "mse-hls" || levels.length === 0) return "Stream";
  if (choice === "auto") return bitrate ? `Auto · ${Math.round(bitrate / 1000)}k` : "Auto";
  return levels.find((level) => level.index === choice)?.label ?? "Stream";
}

function VolumeGlyph({ muted, volume }: { muted: boolean; volume: number }) {
  const className = "size-4";
  if (muted || volume <= 0) return <VolumeX className={className} aria-hidden />;
  if (volume < 0.34) return <Volume className={className} aria-hidden />;
  if (volume < 0.67) return <Volume1 className={className} aria-hidden />;
  return <Volume2 className={className} aria-hidden />;
}

export function PlaybackDock() {
  const session = usePlaybackSession();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const hold = useRef({ focus: false, hover: false, menu: false, scrub: false });
  const collapseTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const compactLayerRef = useRef<HTMLDivElement>(null);
  const expandedLayerRef = useRef<HTMLDivElement>(null);
  const compactPlayRef = useRef<HTMLButtonElement>(null);
  const expandedPlayRef = useRef<HTMLButtonElement>(null);
  const focusLayer = useRef<"compact" | "expanded" | null>(null);
  const seenInteraction = useRef(0);

  const clearCollapse = () => {
    if (collapseTimer.current === null) return;
    window.clearTimeout(collapseTimer.current);
    collapseTimer.current = null;
  };

  const scheduleCollapse = useCallback(() => {
    clearCollapse();
    collapseTimer.current = window.setTimeout(() => {
      const pinned = hold.current;
      if (pinned.focus || pinned.hover || pinned.menu || pinned.scrub) return;
      setExpanded(false);
    }, 1700);
  }, []);

  const expand = useCallback(() => {
    setExpanded(true);
    clearCollapse();
  }, []);

  useEffect(() => {
    if (session.interaction.id === 0 || session.interaction.id === seenInteraction.current) return;
    seenInteraction.current = session.interaction.id;
    setExpanded(true);
    scheduleCollapse();
  }, [scheduleCollapse, session.interaction.id]);

  useLayoutEffect(() => {
    if (expanded && focusLayer.current === "compact") {
      expandedPlayRef.current?.focus();
      focusLayer.current = "expanded";
    } else if (!expanded && focusLayer.current === "expanded") {
      compactPlayRef.current?.focus();
      focusLayer.current = "compact";
    }
  }, [expanded]);

  useEffect(() => () => clearCollapse(), []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(event.target instanceof Node) || root.contains(event.target)) return;
      hold.current.hover = false;
      if (hold.current.menu || hold.current.scrub || hold.current.focus) return;
      setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  if (!session.track) return null;

  const ready = session.track.status === "ready";
  const setHold = (key: keyof typeof hold.current, value: boolean) => {
    hold.current[key] = value;
    if (value) expand();
    else scheduleCollapse();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {ready ? (
        <div
          ref={rootRef}
          className="pointer-events-none grid w-full max-w-3xl items-end justify-items-center"
          onFocusCapture={() => setHold("focus", true)}
          onBlurCapture={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next)) return;
            setHold("focus", false);
          }}
        >
          <div
            ref={compactLayerRef}
            inert={expanded ? true : undefined}
            className={cn(
              "col-start-1 row-start-1 flex w-max max-w-full items-center gap-2 self-end",
              MORPH,
              expanded
                ? "pointer-events-none scale-[0.96] opacity-0"
                : "pointer-events-auto scale-100 opacity-100"
            )}
            onPointerEnter={(event) => {
              if (event.pointerType === "touch") return;
              setHold("hover", true);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "touch") return;
              setHold("hover", false);
            }}
            onFocusCapture={() => {
              focusLayer.current = "compact";
            }}
          >
            <CompactSeek
              scrubbing={scrubbing}
              onScrubStart={() => setHold("scrub", true)}
              onScrubbing={setScrubbing}
              onScrubEnd={() => {
                setScrubbing(null);
                setHold("scrub", false);
              }}
              onExpand={expand}
            />
            <CompactTransport playRef={compactPlayRef} />
          </div>
          <div
            ref={expandedLayerRef}
            inert={expanded ? undefined : true}
            className={cn(
              "col-start-1 row-start-1 flex w-full flex-col gap-2 self-end sm:flex-row sm:items-stretch",
              MORPH,
              expanded
                ? "pointer-events-auto scale-100 opacity-100"
                : "pointer-events-none scale-[0.97] opacity-0"
            )}
            onPointerEnter={(event) => {
              if (event.pointerType === "touch") return;
              setHold("hover", true);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "touch") return;
              setHold("hover", false);
            }}
            onFocusCapture={() => {
              focusLayer.current = "expanded";
            }}
          >
            <ExpandedSeek
              menuOpen={menuOpen}
              scrubbing={scrubbing}
              onScrubStart={() => setHold("scrub", true)}
              onScrubbing={setScrubbing}
              onScrubEnd={() => {
                setScrubbing(null);
                setHold("scrub", false);
              }}
              onMenuOpenChange={(open) => {
                setMenuOpen(open);
                setHold("menu", open);
              }}
            />
            <ExpandedTransport playRef={expandedPlayRef} />
          </div>
        </div>
      ) : (
        <div ref={rootRef} className="pointer-events-auto">
          <StatusIsland />
        </div>
      )}
    </div>
  );
}

function useSeekModel(scrubbing: number | null) {
  const session = usePlaybackSession();
  const clock = usePlaybackClock();
  const elapsed = scrubbing ?? clock.currentTime;
  const duration = clock.duration > 0 ? clock.duration : 0;
  const label = qualityText(
    session.engine,
    session.qualityChoice,
    session.activeBitrate,
    session.levels
  );
  return { duration, elapsed, label, session };
}

function CompactSeek({
  scrubbing,
  onScrubStart,
  onScrubbing,
  onScrubEnd,
  onExpand,
}: {
  scrubbing: number | null;
  onScrubStart: () => void;
  onScrubbing: (time: number | null) => void;
  onScrubEnd: () => void;
  onExpand: () => void;
}) {
  const { duration, elapsed, label, session } = useSeekModel(scrubbing);
  const commit = (time: number) => {
    onScrubbing(null);
    onScrubEnd();
    session.seekTo(time, { animate: true });
  };

  return (
    <section
      aria-label="Seek and audio quality"
      className={cn(
        SURFACE,
        "flex h-12 w-[clamp(7.75rem,34vw,14rem)] min-w-0 items-center gap-1.5 rounded-full py-1 pr-1 pl-2.5"
      )}
    >
      <Slider
        aria-label="Seek"
        disabled={duration <= 0}
        max={duration > 0 ? duration : 1}
        min={0}
        step={0.25}
        value={[duration > 0 ? Math.min(Math.max(0, elapsed), duration) : 0]}
        onValueChange={(value) => {
          onScrubStart();
          onScrubbing(value[0] ?? 0);
        }}
        onValueCommit={(value) => commit(value[0] ?? 0)}
        className="min-w-0 flex-1 **:data-[slot=slider-thumb]:size-3.5 **:data-[slot=slider-track]:h-1"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-9 shrink-0 rounded-full px-2.5 text-muted-foreground hover:text-foreground"
        aria-label={`Stream quality: ${label}. Expand player`}
        onClick={onExpand}
      >
        <Settings2 className="size-3.5" aria-hidden />
        <span className="text-xs">{shortQuality(label)}</span>
      </Button>
    </section>
  );
}

function ExpandedSeek({
  menuOpen,
  scrubbing,
  onScrubStart,
  onScrubbing,
  onScrubEnd,
  onMenuOpenChange,
}: {
  menuOpen: boolean;
  scrubbing: number | null;
  onScrubStart: () => void;
  onScrubbing: (time: number | null) => void;
  onScrubEnd: () => void;
  onMenuOpenChange: (open: boolean) => void;
}) {
  const { duration, elapsed, label, session } = useSeekModel(scrubbing);
  const waveform = useWaveformData(session.track?.fallbackUrl || null, { samples: 220 });
  const waveDuration = duration > 0 ? duration : waveform.duration;
  const commit = (time: number) => {
    onScrubbing(null);
    onScrubEnd();
    session.seekTo(time, { animate: true });
  };

  return (
    <section
      aria-label="Seek and audio quality"
      className={cn(SURFACE, "min-w-0 flex-1 rounded-[1.6rem] px-3.5 py-3")}
    >
      {session.playbackError ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" role="alert">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{session.playbackError}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 shrink-0 rounded-full px-2 text-xs"
            onClick={session.playOriginal}
          >
            Original
          </Button>
        </div>
      ) : (
        <Waveform
          aria-label="Seek"
          barGap={1}
          barRadius={1}
          barWidth={2}
          className="h-10"
          currentTime={waveDuration > 0 ? Math.min(Math.max(0, elapsed), waveDuration) : 0}
          disabled={waveDuration <= 0}
          duration={waveDuration > 0 ? waveDuration : 0}
          loading={false}
          onSeek={(time) => {
            onScrubStart();
            onScrubbing(time);
          }}
          onSeekCommitted={commit}
          peaks={waveform.status === "ready" ? waveform.peaks : null}
          variant="bars"
        >
          <WaveformCanvas />
          <WaveformCursor />
        </Waveform>
      )}
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 justify-between text-[11px] text-muted-foreground tabular-nums">
          <span>{formatTime(elapsed)}</span>
          <span>{formatTime(Math.max(0, waveDuration - elapsed), { remaining: true })}</span>
        </div>
        <QualityMenu label={label} open={menuOpen} onOpenChange={onMenuOpenChange} />
      </div>
    </section>
  );
}

function QualityMenu({
  label,
  open,
  onOpenChange,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const session = usePlaybackSession();
  const menuId = useId();
  const value = session.qualityChoice === "auto" ? "auto" : String(session.qualityChoice);
  const selectable = session.engine === "mse-hls" && session.levels.length > 0;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 max-w-40 shrink-0 rounded-full px-2.5 text-muted-foreground hover:text-foreground"
          aria-label={`Stream quality: ${label}`}
          title={`Quality · ${label}`}
        >
          <Settings2 className="size-3.5" aria-hidden />
          <span className="truncate text-xs">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5" id={menuId}>
        <DropdownMenuLabel className="px-2.5">Quality</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {selectable ? (
          <DropdownMenuRadioGroup value={value} onValueChange={session.applyQuality}>
            <DropdownMenuRadioItem value="auto" className="rounded-lg px-2.5">
              Auto
              {session.activeBitrate ? (
                <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">
                  {Math.round(session.activeBitrate / 1000)} kbps
                </span>
              ) : null}
            </DropdownMenuRadioItem>
            {[...session.levels]
              .sort((a, b) => b.bitrate - a.bitrate)
              .map((level) => (
                <DropdownMenuRadioItem
                  key={level.index}
                  value={String(level.index)}
                  className="rounded-lg px-2.5"
                >
                  {level.label}
                </DropdownMenuRadioItem>
              ))}
          </DropdownMenuRadioGroup>
        ) : (
          <p className="px-2.5 py-1.5 text-sm text-muted-foreground">{label}</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TransportButtons({
  playRef,
  playClassName,
}: {
  playRef?: Ref<HTMLButtonElement>;
  playClassName: string;
}) {
  const session = usePlaybackSession();
  const clock = usePlaybackClock();
  const title = session.track?.title ?? "Nothing playing";

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9 shrink-0 rounded-full sm:size-10"
        aria-label="Previous track"
        disabled={!session.canPrevious}
        onClick={session.previous}
      >
        <SkipBack className="size-4 fill-current" aria-hidden />
      </Button>
      <Button
        ref={playRef}
        type="button"
        size="icon"
        className={cn("shrink-0 rounded-full", playClassName)}
        aria-label={clock.playing ? `Pause ${title}` : `Play ${title}`}
        onClick={session.toggle}
      >
        {clock.playing ? (
          <Pause className="fill-current" aria-hidden />
        ) : (
          <Play className="fill-current pl-0.5" aria-hidden />
        )}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9 shrink-0 rounded-full sm:size-10"
        aria-label="Next track"
        disabled={!session.canNext}
        onClick={session.next}
      >
        <SkipForward className="size-4 fill-current" aria-hidden />
      </Button>
    </>
  );
}

function MuteButton({ className }: { className?: string }) {
  const session = usePlaybackSession();
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn("shrink-0 rounded-full text-muted-foreground hover:text-foreground", className)}
      aria-label={session.muted ? "Unmute" : "Mute"}
      aria-pressed={session.muted}
      onClick={() => {
        if (session.muted && session.volume === 0) session.setVolume(1);
        session.setMuted(!session.muted);
      }}
    >
      <VolumeGlyph muted={session.muted} volume={session.volume} />
    </Button>
  );
}

function CompactTransport({ playRef }: { playRef: Ref<HTMLButtonElement> }) {
  return (
    <section
      aria-label="Playback and volume"
      className={cn(SURFACE, "flex h-12 shrink-0 items-center rounded-full pr-1 pl-1")}
    >
      <TransportButtons playRef={playRef} playClassName="size-9" />
      <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      <MuteButton className="size-9" />
    </section>
  );
}

function ExpandedTransport({ playRef }: { playRef: Ref<HTMLButtonElement> }) {
  const session = usePlaybackSession();
  const title = session.track?.title ?? "Nothing playing";
  const shown = session.muted ? 0 : session.volume;

  return (
    <section
      aria-label="Playback and volume"
      className={cn(SURFACE, "w-full rounded-[1.6rem] px-4 py-3.5 sm:w-80 sm:shrink-0")}
    >
      <p className="truncate text-center text-sm font-medium text-foreground">{title}</p>
      <div className="mt-2.5 flex items-center justify-center gap-3">
        <TransportButtons playRef={playRef} playClassName="size-12" />
      </div>
      <div className="mt-3 flex items-center gap-2.5 pr-1">
        <MuteButton className="size-9" />
        <Slider
          aria-label="Volume"
          max={1}
          min={0}
          step={0.01}
          value={[shown]}
          onValueChange={(value) => {
            const next = value[0] ?? 0;
            session.setVolume(next);
            if (session.muted && next > 0) session.setMuted(false);
            if (!session.muted && next === 0) session.setMuted(true);
          }}
          className="min-w-0 flex-1 **:data-[slot=slider-thumb]:size-3.5 **:data-[slot=slider-track]:h-1.5"
        />
      </div>
    </section>
  );
}

function StatusIsland() {
  const session = usePlaybackSession();
  const track = session.track;
  if (!track) return null;
  const failed = track.status === "failed";

  return (
    <section
      aria-label="Track status"
      className={cn(
        SURFACE,
        "pointer-events-auto flex h-12 max-w-md items-center gap-2 rounded-full px-3"
      )}
    >
      {failed ? (
        <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden />
      ) : (
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-primary" />
      )}
      <p className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{track.title}</span>
        <span className="text-muted-foreground">
          {failed ? " · Processing failed" : " · Processing"}
        </span>
      </p>
      {failed ? (
        <Button asChild variant="outline" size="sm" className="h-7 shrink-0 rounded-full text-xs">
          <Link href="/upload">Upload</Link>
        </Button>
      ) : null}
    </section>
  );
}
