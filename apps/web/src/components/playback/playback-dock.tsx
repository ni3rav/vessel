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
import { useCallback, useEffect, useId, useRef, useState } from "react";

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
import {
  VolumeControl,
  VolumeControlMute,
  VolumeControlSlider,
} from "@/components/ui/volume-control";
import { Waveform, WaveformCanvas, WaveformCursor } from "@/components/ui/waveform";
import { useWaveformData } from "@/hooks/use-waveform-data";
import { formatTime } from "@/lib/audio/time";
import { cn } from "@/lib/utils";

const ISLAND =
  "overflow-hidden border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl transition-[width,height,flex-grow,border-radius,padding] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] focus-within:ring-2 focus-within:ring-ring/40 motion-reduce:transition-none";

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
  const [pulse, setPulse] = useState<"seek" | "transport" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const hold = useRef({ focus: false, hover: false, menu: false, scrub: false });
  const collapseTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
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
    setPulse(session.interaction.section);
    const pulseTimer = window.setTimeout(() => setPulse(null), 700);
    scheduleCollapse();
    return () => window.clearTimeout(pulseTimer);
  }, [scheduleCollapse, session.interaction.id, session.interaction.section]);

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
          className={cn(
            "pointer-events-auto flex w-full max-w-3xl items-end gap-2",
            expanded ? "max-sm:flex-col" : "justify-center"
          )}
          onPointerEnter={(event) => {
            if (event.pointerType === "touch") return;
            setHold("hover", true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "touch") return;
            setHold("hover", false);
          }}
          onFocusCapture={() => setHold("focus", true)}
          onBlurCapture={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next)) return;
            setHold("focus", false);
          }}
        >
          <SeekIsland
            expanded={expanded}
            pulse={pulse === "seek"}
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
            onExpand={expand}
          />
          <TransportIsland expanded={expanded} pulse={pulse === "transport"} onExpand={expand} />
        </div>
      ) : (
        <div ref={rootRef} className="pointer-events-auto">
          <StatusIsland />
        </div>
      )}
    </div>
  );
}

function SeekIsland({
  expanded,
  pulse,
  menuOpen,
  scrubbing,
  onScrubStart,
  onScrubbing,
  onScrubEnd,
  onMenuOpenChange,
  onExpand,
}: {
  expanded: boolean;
  pulse: boolean;
  menuOpen: boolean;
  scrubbing: number | null;
  onScrubStart: () => void;
  onScrubbing: (time: number | null) => void;
  onScrubEnd: () => void;
  onMenuOpenChange: (open: boolean) => void;
  onExpand: () => void;
}) {
  const session = usePlaybackSession();
  const clock = usePlaybackClock();
  const waveform = useWaveformData(session.track?.fallbackUrl || null, { samples: 220 });
  const elapsed = scrubbing ?? clock.currentTime;
  const duration = clock.duration > 0 ? clock.duration : waveform.duration;
  const remaining = Math.max(0, (clock.duration || waveform.duration) - elapsed);
  const label = qualityText(
    session.engine,
    session.qualityChoice,
    session.activeBitrate,
    session.levels
  );

  const commit = (time: number) => {
    onScrubbing(null);
    onScrubEnd();
    session.seekTo(time, { animate: true });
  };

  return (
    <section
      aria-label="Seek and audio quality"
      data-pulse={pulse ? "on" : undefined}
      className={cn(
        ISLAND,
        "pointer-events-auto",
        expanded
          ? "h-[5.6rem] w-full rounded-[1.7rem] px-3 py-2.5 sm:min-w-0 sm:flex-1"
          : "h-11 w-[calc(50%-0.25rem)] max-w-[15rem] shrink-0 rounded-full px-2",
        pulse && "animate-[island-pulse_700ms_ease-out] motion-reduce:animate-none"
      )}
      onClick={onExpand}
    >
      <div className="flex h-full min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className={cn("min-w-0", expanded ? "h-8" : "h-4")}>
            <div className={cn(expanded ? "block" : "hidden")}>
              {session.playbackError ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground" role="alert">
                  <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{session.playbackError}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 rounded-full px-2 text-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      session.playOriginal();
                    }}
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
                  className="h-8"
                  currentTime={duration > 0 ? Math.min(Math.max(0, elapsed), duration) : 0}
                  disabled={duration <= 0}
                  duration={duration > 0 ? duration : 0}
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
            </div>
            <div className={cn("flex h-full items-center", expanded && "hidden")}>
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
                className="w-full **:data-[slot=slider-range]:bg-primary **:data-[slot=slider-thumb]:size-3 **:data-[slot=slider-track]:h-1"
              />
            </div>
          </div>
          <div
            className={cn(
              "mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground tabular-nums",
              !expanded && "sr-only"
            )}
          >
            <span>{formatTime(elapsed)}</span>
            <span>{formatTime(remaining, { remaining: true })}</span>
          </div>
        </div>
        <QualityMenu
          compact={!expanded}
          label={label}
          open={menuOpen}
          onOpenChange={onMenuOpenChange}
        />
      </div>
    </section>
  );
}

function QualityMenu({
  compact,
  label,
  open,
  onOpenChange,
}: {
  compact: boolean;
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
          className="h-8 max-w-28 shrink-0 rounded-full px-2 text-muted-foreground hover:text-foreground"
          aria-label={`Stream quality: ${label}`}
          title={`Quality · ${label}`}
          onClick={(event) => event.stopPropagation()}
        >
          <Settings2 className="size-3.5" aria-hidden />
          <span className="truncate text-[11px]">{compact ? shortQuality(label) : label}</span>
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

function TransportIsland({
  expanded,
  pulse,
  onExpand,
}: {
  expanded: boolean;
  pulse: boolean;
  onExpand: () => void;
}) {
  const session = usePlaybackSession();
  const clock = usePlaybackClock();
  const title = session.track?.title ?? "Nothing playing";

  return (
    <section
      aria-label="Playback and volume"
      data-pulse={pulse ? "on" : undefined}
      className={cn(
        ISLAND,
        "pointer-events-auto",
        expanded
          ? "h-[5.6rem] w-full rounded-[1.7rem] px-3 py-2.5 sm:w-[17.5rem] sm:shrink-0"
          : "h-11 w-[calc(50%-0.25rem)] max-w-[13.5rem] shrink-0 rounded-full px-1",
        pulse && "animate-[island-pulse_700ms_ease-out] motion-reduce:animate-none"
      )}
      onClick={onExpand}
    >
      <div className="flex h-full min-w-0 flex-col justify-center gap-1.5">
        <p
          className={cn(
            "truncate px-1 text-sm font-medium text-foreground",
            expanded ? "block" : "sr-only"
          )}
        >
          {title}
        </p>
        <div className="flex min-w-0 items-center gap-0.5 sm:gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 shrink-0 rounded-full"
            aria-label="Previous track"
            disabled={!session.canPrevious}
            onClick={(event) => {
              event.stopPropagation();
              session.previous();
            }}
          >
            <SkipBack className="size-4 fill-current" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            className="size-9 shrink-0 rounded-full"
            aria-label={clock.playing ? `Pause ${title}` : `Play ${title}`}
            onClick={(event) => {
              event.stopPropagation();
              session.toggle();
            }}
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
            className="size-8 shrink-0 rounded-full"
            aria-label="Next track"
            disabled={!session.canNext}
            onClick={(event) => {
              event.stopPropagation();
              session.next();
            }}
          >
            <SkipForward className="size-4 fill-current" aria-hidden />
          </Button>
          <VolumeControl
            className="min-w-0 shrink gap-1"
            muted={session.muted}
            onMutedChange={session.setMuted}
            onValueChange={session.setVolume}
            size="sm"
            value={session.volume}
            onClick={(event) => event.stopPropagation()}
          >
            <VolumeControlMute
              className="size-8 rounded-full"
              onClick={(event) => event.stopPropagation()}
            >
              <VolumeGlyph muted={session.muted} volume={session.volume} />
            </VolumeControlMute>
            <VolumeControlSlider
              className={cn(
                "min-w-0 transition-[width,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                expanded ? "w-16 opacity-100 sm:w-20" : "w-0 overflow-hidden opacity-0"
              )}
            />
          </VolumeControl>
        </div>
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
        ISLAND,
        "pointer-events-auto flex h-11 max-w-md items-center gap-2 rounded-full px-3"
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
