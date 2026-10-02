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
import { motion, MotionConfig } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ComponentProps, ReactNode, Ref } from "react";

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

const COLLAPSE_DELAY_MS = 7000;
const MORPH = { type: "spring" as const, bounce: 0.1, visualDuration: 0.38 };
const PRESS = { type: "spring" as const, bounce: 0.14, visualDuration: 0.16 };
const REVEAL_MS = 320;
const SURFACE = "border border-border/70 bg-background/90 shadow-lg backdrop-blur-xl";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
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

function DockButton({ className, disabled, children, ...props }: ComponentProps<typeof Button>) {
  return (
    <motion.span
      whileTap={disabled ? undefined : { scale: 0.92 }}
      transition={PRESS}
      className={cn(
        "inline-flex shrink-0 rounded-full",
        disabled && "pointer-events-none",
        className
      )}
    >
      <Button
        disabled={disabled}
        className="dock-control size-full touch-manipulation rounded-full"
        {...props}
      >
        {children}
      </Button>
    </motion.span>
  );
}

function Island({
  expanded,
  label,
  compactClassName,
  expandedClassName,
  open,
  closed,
}: {
  expanded: boolean;
  label: string;
  compactClassName: string;
  expandedClassName: string;
  open: ReactNode;
  closed: ReactNode;
}) {
  const [shown, setShown] = useState(expanded);
  const traveling = shown !== expanded;

  useEffect(() => {
    if (!traveling) return undefined;
    const id = window.setTimeout(() => setShown(expanded), REVEAL_MS);
    return () => window.clearTimeout(id);
  }, [expanded, traveling]);

  return (
    <motion.section
      layout
      layoutDependency={expanded}
      initial={false}
      aria-label={label}
      className={cn(
        "dock-island relative overflow-hidden",
        SURFACE,
        expanded ? expandedClassName : compactClassName
      )}
      style={{ borderRadius: expanded ? 26 : 999 }}
      transition={{ layout: MORPH, borderRadius: MORPH }}
    >
      <div
        className={cn(
          "absolute inset-0",
          traveling ? "opacity-0 transition-none" : "transition-opacity duration-200",
          !traveling && !expanded ? "opacity-100" : "opacity-0"
        )}
        style={{ pointerEvents: expanded || traveling ? "none" : "auto" }}
        inert={expanded || traveling || undefined}
      >
        {closed}
      </div>
      <div
        className={cn(
          "absolute inset-0",
          traveling ? "opacity-0 transition-none" : "transition-opacity duration-200",
          !traveling && expanded ? "opacity-100" : "opacity-0"
        )}
        style={{ pointerEvents: !expanded || traveling ? "none" : "auto" }}
        inert={!expanded || traveling || undefined}
      >
        {open}
      </div>
    </motion.section>
  );
}

export function PlaybackDock() {
  const session = usePlaybackSession();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const hold = useRef({
    focus: false,
    hover: false,
    menu: false,
    scrub: false,
    pointer: false,
  });
  const collapseTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const suppressFocusExpand = useRef(false);
  const keyStamp = useRef(-1);
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
      if (pinned.focus || pinned.hover || pinned.menu || pinned.scrub || pinned.pointer) return;
      setExpanded(false);
    }, COLLAPSE_DELAY_MS);
  }, []);

  const expand = useCallback(() => {
    if (suppressFocusExpand.current) return;
    setExpanded(true);
    scheduleCollapse();
  }, [scheduleCollapse]);

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
    const release = () => {
      if (!hold.current.pointer) return;
      hold.current.pointer = false;
      scheduleCollapse();
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [scheduleCollapse]);

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
  const setHold = (key: "focus" | "hover" | "menu" | "scrub", value: boolean) => {
    hold.current[key] = value;
    if (value && key !== "scrub") expand();
    else if (!value) scheduleCollapse();
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {ready ? (
          <motion.div
            ref={rootRef}
            layoutRoot
            data-expanded={expanded ? "true" : "false"}
            className={cn(
              "pointer-events-auto flex w-full max-w-3xl touch-manipulation",
              expanded
                ? "flex-col gap-2 sm:flex-row sm:items-stretch"
                : "flex-row items-center justify-center gap-1.5"
            )}
            onPointerDown={() => {
              hold.current.pointer = true;
              clearCollapse();
            }}
            onPointerEnter={(event) => {
              if (event.pointerType === "touch") return;
              setHold("hover", true);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "touch") return;
              setHold("hover", false);
            }}
            onFocusCapture={(event) => {
              if (suppressFocusExpand.current) return;
              const target = event.target;
              if (!(target instanceof HTMLElement) || !target.matches(":focus-visible")) return;
              setHold("focus", true);
            }}
            onBlurCapture={(event) => {
              const next = event.relatedTarget;
              if (next instanceof Node && event.currentTarget.contains(next)) return;
              setHold("focus", false);
            }}
          >
            <SeekIsland
              expanded={expanded}
              menuOpen={menuOpen}
              scrubbing={scrubbing}
              onExpand={expand}
              onMenuOpenChange={(open) => {
                setMenuOpen(open);
                setHold("menu", open);
              }}
              onScrubStart={() => setHold("scrub", true)}
              onScrubbing={setScrubbing}
              onScrubEnd={() => {
                setScrubbing(null);
                setHold("scrub", false);
              }}
            />
            <Island
              expanded={expanded}
              label="Playback and volume"
              compactClassName="h-10 w-[9.5rem] shrink-0"
              expandedClassName="h-[9.25rem] w-full shrink-0 sm:w-80"
              closed={<CompactTransport />}
              open={<ExpandedTransport onCollapse={collapse} />}
            />
          </motion.div>
        ) : (
          <div ref={rootRef} className="pointer-events-auto">
            <StatusIsland />
          </div>
        )}
      </div>
    </MotionConfig>
  );
}

function SeekIsland({
  expanded,
  menuOpen,
  scrubbing,
  onExpand,
  onMenuOpenChange,
  onScrubStart,
  onScrubbing,
  onScrubEnd,
}: {
  expanded: boolean;
  menuOpen: boolean;
  scrubbing: number | null;
  onExpand: () => void;
  onMenuOpenChange: (open: boolean) => void;
  onScrubStart: () => void;
  onScrubbing: (time: number | null) => void;
  onScrubEnd: () => void;
}) {
  const session = usePlaybackSession();
  const waveform = useWaveformData(session.track?.fallbackUrl || null, { samples: 220 });

  return (
    <Island
      expanded={expanded}
      label="Seek and audio quality"
      compactClassName="h-10 w-[clamp(6.25rem,28vw,10.5rem)]"
      expandedClassName="h-[7.75rem] w-full sm:min-w-0 sm:flex-1"
      closed={
        <CompactSeek
          scrubbing={scrubbing}
          onScrubStart={onScrubStart}
          onScrubbing={onScrubbing}
          onScrubEnd={onScrubEnd}
          onExpand={onExpand}
        />
      }
      open={
        <ExpandedSeek
          menuOpen={menuOpen}
          scrubbing={scrubbing}
          waveform={waveform}
          onScrubStart={onScrubStart}
          onScrubbing={onScrubbing}
          onScrubEnd={onScrubEnd}
          onMenuOpenChange={onMenuOpenChange}
        />
      }
    />
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
    <div className="flex h-full min-w-0 items-center gap-1 pr-1 pl-2.5">
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
        className="min-w-0 flex-1 **:data-[slot=slider-thumb]:size-3 **:data-[slot=slider-track]:h-1"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="dock-control h-7 shrink-0 rounded-full px-2 text-muted-foreground hover:text-foreground"
        aria-label={`Stream quality: ${label}. Expand player`}
        onClick={onExpand}
      >
        <Settings2 className="size-3.5" aria-hidden />
        <span className="text-[11px]">{shortQuality(label)}</span>
      </Button>
    </div>
  );
}

function ExpandedSeek({
  menuOpen,
  scrubbing,
  waveform,
  onScrubStart,
  onScrubbing,
  onScrubEnd,
  onMenuOpenChange,
}: {
  menuOpen: boolean;
  scrubbing: number | null;
  waveform: ReturnType<typeof useWaveformData>;
  onScrubStart: () => void;
  onScrubbing: (time: number | null) => void;
  onScrubEnd: () => void;
  onMenuOpenChange: (open: boolean) => void;
}) {
  const { duration, elapsed, label, session } = useSeekModel(scrubbing);
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
            className="dock-control h-7 shrink-0 rounded-full px-2 text-xs"
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
          className="dock-control h-8 max-w-40 shrink-0 rounded-full px-2.5 text-muted-foreground hover:text-foreground"
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
  buttonClassName,
}: {
  playRef?: Ref<HTMLButtonElement>;
  playClassName: string;
  buttonClassName: string;
}) {
  const session = usePlaybackSession();
  const clock = usePlaybackClock();
  const title = session.track?.title ?? "Nothing playing";

  return (
    <>
      <DockButton
        type="button"
        size="icon"
        variant="ghost"
        className={buttonClassName}
        aria-label="Previous track"
        disabled={!session.canPrevious}
        onClick={session.previous}
      >
        <SkipBack className="size-3.5 fill-current" aria-hidden />
      </DockButton>
      <DockButton
        ref={playRef}
        type="button"
        size="icon"
        className={playClassName}
        aria-label={clock.playing ? `Pause ${title}` : `Play ${title}`}
        onClick={session.toggle}
      >
        {clock.playing ? (
          <Pause className="size-4 fill-current" aria-hidden />
        ) : (
          <Play className="size-4 fill-current pl-0.5" aria-hidden />
        )}
      </DockButton>
      <DockButton
        type="button"
        size="icon"
        variant="ghost"
        className={buttonClassName}
        aria-label="Next track"
        disabled={!session.canNext}
        onClick={session.next}
      >
        <SkipForward className="size-3.5 fill-current" aria-hidden />
      </DockButton>
    </>
  );
}

function MuteButton({ className }: { className?: string }) {
  const session = usePlaybackSession();
  return (
    <DockButton
      type="button"
      size="icon"
      variant="ghost"
      className={cn("text-muted-foreground hover:text-foreground", className)}
      aria-label={session.muted ? "Unmute" : "Mute"}
      aria-pressed={session.muted}
      onClick={() => {
        if (session.muted && session.volume === 0) session.setVolume(1);
        session.setMuted(!session.muted);
      }}
    >
      <VolumeGlyph muted={session.muted} volume={session.volume} />
    </DockButton>
  );
}

function CompactTransport() {
  return (
    <div className="flex h-full items-center gap-0.5 px-1">
      <TransportButtons buttonClassName="size-8" playClassName="size-8" />
      <span aria-hidden className="mx-0.5 h-3.5 w-px shrink-0 bg-border/80" />
      <MuteButton className="size-8" />
    </div>
  );
}

function ExpandedTransport({ onCollapse }: { onCollapse: () => void }) {
  const session = usePlaybackSession();
  const title = session.track?.title ?? "Nothing playing";
  const shown = session.muted ? 0 : session.volume;

  return (
    <div className="flex h-full w-full flex-col justify-center px-4 py-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-center text-sm font-medium text-foreground">
          {title}
        </p>
        <motion.span
          whileTap={{ scale: 0.92 }}
          transition={{ scale: PRESS }}
          className="inline-flex size-8 shrink-0"
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="dock-control size-full rounded-full text-muted-foreground"
            aria-label="Collapse player"
            onClick={onCollapse}
          >
            <ChevronDown className="size-4" aria-hidden />
          </Button>
        </motion.span>
      </div>
      <div className="mt-2 flex items-center justify-center gap-3">
        <TransportButtons buttonClassName="size-10" playClassName="size-11" />
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
        "pointer-events-auto flex h-10 max-w-md items-center gap-2 rounded-full px-3"
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
