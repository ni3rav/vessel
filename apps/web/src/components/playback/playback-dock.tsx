"use client";

import {
  AlertCircle,
  ChevronDown,
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
import type { Ref, RefObject } from "react";

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

const EASING = "cubic-bezier(0.23, 1, 0.32, 1)";
const MORPH_MS = 280;
const LAYER =
  "dock-layer absolute inset-0 transition-opacity duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none";
const SURFACE = "border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function useIslandFlip(
  expanded: boolean,
  mounted: boolean,
  refs: RefObject<Array<RefObject<HTMLElement | null>>>
) {
  const previous = useRef<{ expanded: boolean; rects: DOMRect[] } | null>(null);

  useLayoutEffect(() => {
    const elements = refs.current
      .map((ref) => ref.current)
      .filter((element): element is HTMLElement => Boolean(element));
    const last = previous.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!mounted || !last || last.expanded === expanded || reduce) {
      previous.current = {
        expanded,
        rects: elements.map((element) => element.getBoundingClientRect()),
      };
      return;
    }

    const nextRects: DOMRect[] = [];
    elements.forEach((element, index) => {
      const first = last.rects[index];
      const next = element.getBoundingClientRect();
      nextRects[index] = next;
      if (!first) return;
      const dx = first.left - next.left;
      const dy = first.top - next.top;
      const sx = first.width / Math.max(next.width, 1);
      const sy = first.height / Math.max(next.height, 1);
      element.getAnimations().forEach((animation) => animation.cancel());
      element.dataset.morphing = "";
      const animation = element.animate(
        [
          {
            borderRadius: last.expanded ? "26px" : "999px",
            transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
            transformOrigin: "top left",
          },
          {
            borderRadius: expanded ? "26px" : "999px",
            transform: "translate(0px, 0px) scale(1, 1)",
            transformOrigin: "top left",
          },
        ],
        { duration: MORPH_MS, easing: EASING, fill: "both" }
      );
      const clear = () => {
        delete element.dataset.morphing;
      };
      animation.finished.then(clear, clear);
    });
    previous.current = { expanded, rects: nextRects };
  }, [expanded, mounted, refs]);
}

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
  const seekRef = useRef<HTMLElement>(null);
  const transportRef = useRef<HTMLElement>(null);
  const islandRefs = useRef([seekRef, transportRef]);
  const suppressFocusExpand = useRef(false);
  const keyStamp = useRef(-1);
  const seenInteraction = useRef(0);
  useIslandFlip(expanded, session.track?.status === "ready", islandRefs);

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
    if (suppressFocusExpand.current) return;
    setExpanded(true);
    clearCollapse();
  }, []);

  const collapse = useCallback(() => {
    suppressFocusExpand.current = true;
    hold.current.focus = false;
    hold.current.hover = false;
    hold.current.menu = false;
    setMenuOpen(false);
    setExpanded(false);
  }, []);

  useEffect(() => {
    if (!expanded) suppressFocusExpand.current = false;
  }, [expanded]);

  useEffect(() => {
    if (session.interaction.id === 0 || session.interaction.id === seenInteraction.current) return;
    seenInteraction.current = session.interaction.id;
    setExpanded(true);
    scheduleCollapse();
  }, [scheduleCollapse, session.interaction.id]);

  useEffect(() => () => clearCollapse(), []);

  useEffect(() => {
    if (!expanded) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[role='menu'], [data-slot='dropdown-menu-content']")
      ) {
        return;
      }
      collapse();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [collapse, expanded]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.timeStamp === keyStamp.current) return;
      keyStamp.current = event.timeStamp;
      if (isTypingTarget(event.target)) return;
      if (event.key === "Escape") {
        if (menuOpen || !expanded) return;
        event.preventDefault();
        collapse();
        return;
      }
      if (event.key === "\\" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        setExpanded((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collapse, expanded, menuOpen]);

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
          data-expanded={expanded ? "true" : "false"}
          className={cn(
            "pointer-events-auto flex w-full max-w-3xl gap-2",
            expanded ? "flex-col sm:flex-row sm:items-stretch" : "flex-row items-end justify-center"
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
            if (suppressFocusExpand.current) return;
            setHold("focus", true);
          }}
          onBlurCapture={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next)) return;
            setHold("focus", false);
          }}
        >
          <section
            ref={seekRef}
            aria-label="Seek and audio quality"
            data-island="seek"
            className={cn(
              "dock-island relative overflow-hidden",
              SURFACE,
              expanded
                ? "h-[7.75rem] w-full rounded-[1.6rem] sm:w-auto sm:min-w-0 sm:flex-1"
                : "h-12 w-[clamp(6.75rem,32vw,14rem)] rounded-full"
            )}
          >
            <div
              className={cn(LAYER, expanded && "pointer-events-none opacity-0")}
              inert={expanded || undefined}
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
            </div>
            <div
              className={cn(LAYER, !expanded && "pointer-events-none opacity-0")}
              inert={expanded ? undefined : true}
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
            </div>
          </section>
          <section
            ref={transportRef}
            aria-label="Playback and volume"
            data-island="transport"
            className={cn(
              "dock-island relative overflow-hidden",
              SURFACE,
              expanded
                ? "h-[9.25rem] w-full rounded-[1.6rem] sm:w-80 sm:shrink-0"
                : "h-12 w-[10.5rem] shrink-0 rounded-full"
            )}
          >
            <div
              className={cn(LAYER, expanded && "pointer-events-none opacity-0")}
              inert={expanded || undefined}
            >
              <CompactTransport />
            </div>
            <div
              className={cn(LAYER, !expanded && "pointer-events-none opacity-0")}
              inert={expanded ? undefined : true}
            >
              <ExpandedTransport onCollapse={collapse} />
            </div>
          </section>
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
    <div className="flex h-full min-w-0 items-center gap-1.5 pr-1 pl-2.5">
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
    </div>
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
    <div className="flex h-full min-w-0 flex-col justify-center px-3.5 py-3">
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
    </div>
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

function CompactTransport() {
  return (
    <div className="flex h-full items-center pr-1 pl-1">
      <TransportButtons playClassName="size-9" />
      <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />
      <MuteButton className="size-9" />
    </div>
  );
}

function ExpandedTransport({ onCollapse }: { onCollapse: () => void }) {
  const session = usePlaybackSession();
  const title = session.track?.title ?? "Nothing playing";
  const shown = session.muted ? 0 : session.volume;

  return (
    <div className="flex h-full flex-col justify-center px-4 py-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-center text-sm font-medium text-foreground">
          {title}
        </p>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 rounded-full text-muted-foreground"
          aria-label="Collapse player"
          onClick={onCollapse}
        >
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-center gap-3">
        <TransportButtons playClassName="size-11" />
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
    </div>
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
