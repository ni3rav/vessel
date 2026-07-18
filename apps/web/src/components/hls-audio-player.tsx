"use client";

import Hls from "hls.js";
import {
  AlertCircle,
  Pause,
  Play,
  Settings2,
  SkipBack,
  SkipForward,
} from "lucide-react";
import type { KeyboardEvent, Ref } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

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
import { cn } from "@/lib/utils";

type Props = {
  hlsUrl: string;
  fallbackUrl: string;
  /** Accessible name */
  label: string;
  /** Visible title in player chrome */
  title?: string;
  /** Secondary line under title (e.g. date added) */
  subtitle?: string;
  /** full = card player; dock = slim bottom bar */
  variant?: "full" | "dock";
  onPrevious?: () => void;
  onNext?: () => void;
  canPrevious?: boolean;
  canNext?: boolean;
  controlsRef?: Ref<HlsPlayerControls | null>;
};

export type HlsPlayerControls = {
  togglePlay: () => void;
  seekBy: (deltaSeconds: number) => void;
};

function formatWallClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBitrate(bps: number) {
  if (!bps || !Number.isFinite(bps)) return "Unknown bitrate";
  const kbps = Math.round(bps / 1000);
  return `${kbps} kbps`;
}

function cleanupAudio(audio: HTMLAudioElement) {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

function subscribeToNothing() {
  return () => {};
}

function useIsClientMounted() {
  return useSyncExternalStore(subscribeToNothing, () => true, () => false);
}

function useAudioPlaybackCaps() {
  const mounted = useIsClientMounted();

  return useMemo(() => {
    if (!mounted || typeof window === "undefined") {
      return null;
    }

    const probe = document.createElement("audio");
    const nativeHls =
      probe.canPlayType("application/vnd.apple.mpegurl") !== "" ||
      probe.canPlayType("application/x-mpegURL") !== "";

    return {
      nativeHls,
      mseHls: Hls.isSupported(),
    };
  }, [mounted]);
}

export function HlsAudioPlayer({
  hlsUrl,
  fallbackUrl,
  label,
  title,
  subtitle,
  variant = "full",
  onPrevious,
  onNext,
  canPrevious = false,
  canNext = false,
  controlsRef,
}: Props) {
  const displayTitle = title ?? label;
  const isDock = variant === "dock";
  const showSkip = Boolean(onPrevious || onNext);

  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const caps = useAudioPlaybackCaps();

  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [preferOriginalFile, setPreferOriginalFile] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const [scrubbing, setScrubbing] = useState<number | null>(null);

  const [bufferedEndRatio, setBufferedEndRatio] = useState(0);

  const [engine, setEngine] = useState<"none" | "native-hls" | "mse-hls" | "direct">("none");

  const [mseLevels, setMseLevels] = useState<
    Array<{ index: number; label: string; bitrate: number }>
  >([]);
  const [qualityChoice, setQualityChoice] = useState<"auto" | number>("auto");
  const [activeLevelIndex, setActiveLevelIndex] = useState(0);

  const directPlaybackOnly = caps !== null && !caps.nativeHls && !caps.mseHls;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || caps === null) return;

    setPlaybackError(null);
    setPreferOriginalFile(false);
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setScrubbing(null);
    setBufferedEndRatio(0);
    setEngine("none");
    setMseLevels([]);
    setQualityChoice("auto");
    setActiveLevelIndex(0);

    let cancelled = false;

    let raf = 0;
    const bumpTime = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        setCurrentTime(audio.currentTime);
      });
    };

    const onLoadedMeta = () => {
      const d = audio.duration;
      setDuration(Number.isFinite(d) ? d : 0);
      bumpTime();
    };

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    const onProgress = () => {
      try {
        const d = audio.duration;
        if (!Number.isFinite(d) || d <= 0) {
          setBufferedEndRatio(0);
          return;
        }
        const br = audio.buffered;
        if (!br.length) {
          setBufferedEndRatio(0);
          return;
        }
        const end = br.end(br.length - 1);
        setBufferedEndRatio(Math.min(1, end / d));
      } catch {
        setBufferedEndRatio(0);
      }
    };

    audio.addEventListener("timeupdate", bumpTime);
    audio.addEventListener("seeked", bumpTime);
    audio.addEventListener("loadedmetadata", onLoadedMeta);
    audio.addEventListener("durationchange", onLoadedMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("progress", onProgress);

    setPlaying(!audio.paused);
    onProgress();
    onLoadedMeta();

    const detach = () => {
      if (raf) cancelAnimationFrame(raf);
      audio.removeEventListener("timeupdate", bumpTime);
      audio.removeEventListener("seeked", bumpTime);
      audio.removeEventListener("loadedmetadata", onLoadedMeta);
      audio.removeEventListener("durationchange", onLoadedMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("progress", onProgress);
    };

    audio.volume = 1;
    audio.muted = false;

    if (caps.nativeHls) {
      setEngine("native-hls");
      audio.src = hlsUrl;
      const onError = () => {
        if (cancelled) return;
        setPlaybackError("Streaming is unavailable. You can try the original file.");
      };
      audio.addEventListener("error", onError);
      return () => {
        cancelled = true;
        detach();
        audio.removeEventListener("error", onError);
        cleanupAudio(audio);
      };
    }

    if (caps.mseHls) {
      setEngine("mse-hls");
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(audio);

      const syncLevels = () => {
        if (cancelled) return;
        setMseLevels(
          hls.levels.map((lvl, index) => ({
            index,
            bitrate: lvl.bitrate,
            label: lvl.name?.trim() ? lvl.name.trim() : formatBitrate(lvl.bitrate),
          })),
        );
      };

      hls.on(Hls.Events.MANIFEST_PARSED, syncLevels);
      hls.on(Hls.Events.LEVELS_UPDATED, syncLevels);
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
        if (cancelled) return;
        setActiveLevelIndex(data.level);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (cancelled || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        hls.destroy();
        hlsRef.current = null;
        setPlaybackError("Playback could not start. You can try the original file.");
      });

      queueMicrotask(syncLevels);

      return () => {
        cancelled = true;
        detach();
        hls.destroy();
        hlsRef.current = null;
        cleanupAudio(audio);
      };
    }

    setEngine("direct");
    audio.src = fallbackUrl;
    return () => {
      cancelled = true;
      detach();
      cleanupAudio(audio);
    };
  }, [hlsUrl, fallbackUrl, caps]);

  const playOriginalFile = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    cleanupAudio(audio);
    setPreferOriginalFile(true);
    setPlaybackError(null);
    setMseLevels([]);
    setQualityChoice("auto");
    audio.volume = 1;
    audio.muted = false;
    audio.src = fallbackUrl;
    setEngine("direct");
  }, [fallbackUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const seekBy = useCallback((deltaSeconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + deltaSeconds));
  }, []);

  useImperativeHandle(
    controlsRef,
    () => ({
      togglePlay,
      seekBy,
    }),
    [togglePlay, seekBy],
  );

  const onSeekSliderChange = useCallback((v: number[]) => {
    const t = v[0] ?? 0;
    setScrubbing(t);
  }, []);

  const onSeekSliderCommit = useCallback((v: number[]) => {
    const audio = audioRef.current;
    const t = v[0] ?? 0;
    setScrubbing(null);
    if (audio && Number.isFinite(audio.duration)) {
      audio.currentTime = t;
    }
  }, []);

  const applyQuality = useCallback((value: string) => {
    const hls = hlsRef.current;
    if (!hls) return;
    if (value === "auto") {
      hls.loadLevel = -1;
      setQualityChoice("auto");
      return;
    }
    const idx = Number.parseInt(value, 10);
    if (!Number.isFinite(idx)) return;
    hls.loadLevel = idx;
    setQualityChoice(idx);
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      if (target && target !== e.currentTarget && target.closest("button,[data-slot=slider-thumb]")) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        seekBy(-5);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        seekBy(5);
      }
    },
    [seekBy, togglePlay],
  );

  const showSoftFallbackNotice =
    !playbackError && caps !== null && (directPlaybackOnly || preferOriginalFile);

  const qualityMenuOpen = engine === "mse-hls" && mseLevels.length > 1;

  const activeBitrate =
    engine === "mse-hls" && mseLevels.length > 0
      ? mseLevels[Math.min(activeLevelIndex, mseLevels.length - 1)]?.bitrate ?? 0
      : 0;

  const qualityTriggerLabel = useMemo(() => {
    if (engine === "native-hls") return "Adaptive";
    if (!qualityMenuOpen) return "Stream";
    if (qualityChoice === "auto") {
      return activeBitrate ? `Auto · ${formatBitrate(activeBitrate)}` : "Auto";
    }
    const row = mseLevels.find((l) => l.index === qualityChoice);
    return row?.label ?? "Stream";
  }, [engine, qualityMenuOpen, qualityChoice, activeBitrate, mseLevels]);

  const effectiveDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const elapsed = scrubbing ?? currentTime;
  const remaining = Math.max(0, effectiveDuration - elapsed);
  const seekDisabled = !Number.isFinite(effectiveDuration) || effectiveDuration <= 0;

  const seekValue = [Math.min(Math.max(0, elapsed), effectiveDuration || 0)];
  const seekMax = seekDisabled ? 1 : effectiveDuration;

  const metaLine = useMemo(() => {
    const parts: string[] = [];
    if (subtitle?.trim()) parts.push(subtitle.trim());
    if (engine === "none") parts.push("Loading");
    else if (engine === "direct") parts.push("Original file");
    else if (engine === "native-hls") parts.push("Adaptive · Safari");
    else if (engine === "mse-hls") parts.push("Adaptive stream");
    return parts.join(" · ");
  }, [subtitle, engine]);

  const hintsId = useId();

  const qualityMenu = qualityMenuOpen ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          aria-label={`Stream quality: ${qualityTriggerLabel}`}
          title={`Quality · ${qualityTriggerLabel}`}
        >
          <Settings2 className="size-3.5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5">
        <DropdownMenuLabel className="px-2.5">Quality</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={qualityChoice === "auto" ? "auto" : String(qualityChoice)}
          onValueChange={applyQuality}
        >
          <DropdownMenuRadioItem value="auto" className="rounded-lg px-2.5">
            Auto
            {activeBitrate ? (
              <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">
                {formatBitrate(activeBitrate)}
              </span>
            ) : null}
          </DropdownMenuRadioItem>
          {[...mseLevels]
            .slice()
            .sort((a, b) => b.bitrate - a.bitrate)
            .map((lvl) => (
              <DropdownMenuRadioItem key={lvl.index} value={String(lvl.index)} className="rounded-lg px-2.5">
                {lvl.label}
              </DropdownMenuRadioItem>
            ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  if (isDock) {
    return (
      <div className="flex w-full flex-col gap-1.5">
        <audio ref={audioRef} preload="metadata" aria-label={label} className="sr-only" />

        {playbackError ? (
          <div
            className="flex items-center justify-between gap-3 px-1 py-1"
            role="alert"
          >
            <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{playbackError}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 text-xs"
              onClick={playOriginalFile}
            >
              Original
            </Button>
          </div>
        ) : (
          <div
            role="region"
            aria-label={label}
            aria-describedby={hintsId}
            tabIndex={0}
            onKeyDown={onKeyDown}
            className={cn(
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              caps === null && "pointer-events-none opacity-50",
            )}
          >
            <span id={hintsId} className="sr-only">
              Press Space to play or pause. Arrow keys seek by five seconds when the player is focused.
            </span>

            <div className="flex items-center gap-2 sm:gap-3">
              {showSkip ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0 rounded-full touch-manipulation"
                  aria-label="Previous track"
                  disabled={!canPrevious}
                  onClick={onPrevious}
                >
                  <SkipBack className="size-4 fill-current" aria-hidden />
                </Button>
              ) : null}

              <Button
                type="button"
                size="icon"
                className="size-10 shrink-0 rounded-full touch-manipulation"
                aria-label={playing ? `Pause ${displayTitle}` : `Play ${displayTitle}`}
                disabled={caps === null}
                onClick={togglePlay}
              >
                {playing ? (
                  <Pause className="fill-current" aria-hidden />
                ) : (
                  <Play className="fill-current pl-0.5" aria-hidden />
                )}
              </Button>

              {showSkip ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 shrink-0 rounded-full touch-manipulation"
                  aria-label="Next track"
                  disabled={!canNext}
                  onClick={onNext}
                >
                  <SkipForward className="size-4 fill-current" aria-hidden />
                </Button>
              ) : null}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight text-foreground">
                  {displayTitle}
                </p>
                <div className="mt-1.5">
                  <div className="relative py-0.5">
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-1 -translate-y-1/2 rounded-full bg-muted"
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute left-0 top-1/2 z-0 h-1 max-w-full -translate-y-1/2 rounded-full bg-muted-foreground/20"
                      style={{ width: `${bufferedEndRatio * 100}%` }}
                    />
                    <Slider
                      disabled={seekDisabled || caps === null}
                      min={0}
                      max={seekMax}
                      step={0.25}
                      value={seekValue}
                      onValueChange={onSeekSliderChange}
                      onValueCommit={onSeekSliderCommit}
                      className="relative z-10 w-full **:data-[slot=slider-track]:h-1 **:data-[slot=slider-track]:bg-transparent **:data-[slot=slider-range]:bg-primary **:data-[slot=slider-thumb]:size-3.5 **:data-[slot=slider-thumb]:border-border"
                    />
                  </div>
                  <div className="mt-1 flex justify-between gap-3 tabular-nums text-[11px] text-muted-foreground">
                    <span>{formatWallClock(elapsed)}</span>
                    <span>−{formatWallClock(remaining)}</span>
                  </div>
                </div>
              </div>

              <div className="shrink-0">{qualityMenu}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <audio ref={audioRef} preload="metadata" aria-label={label} className="sr-only" />

      {!playbackError ? (
        <div
          role="region"
          aria-label={label}
          aria-describedby={hintsId}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className={cn(
            "rounded-lg border border-border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-5",
            caps === null && "pointer-events-none opacity-50",
          )}
        >
          <span id={hintsId} className="sr-only">
            Press Space to play or pause. Arrow keys seek by five seconds when the player panel is focused.
          </span>

          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <Button
                  type="button"
                  size="icon-lg"
                  className="size-11 shrink-0 rounded-full touch-manipulation [&_svg]:size-[1.35rem]"
                  aria-label={playing ? `Pause ${displayTitle}` : `Play ${displayTitle}`}
                  disabled={caps === null}
                  onClick={togglePlay}
                >
                  {playing ? (
                    <Pause className="fill-current" aria-hidden />
                  ) : (
                    <Play className="fill-current pl-0.5" aria-hidden />
                  )}
                </Button>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h2 className="font-heading truncate text-base font-semibold leading-snug text-foreground sm:text-lg">
                    {displayTitle}
                  </h2>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{metaLine}</p>
                </div>
              </div>
              <div className="shrink-0 pt-px">
                {qualityMenu}
                {!qualityMenuOpen && engine === "mse-hls" && mseLevels.length === 1 ? (
                  <span className="block max-w-40 truncate text-right text-xs tabular-nums text-muted-foreground sm:max-w-none">
                    {mseLevels[0]?.label ?? "One stream"}
                  </span>
                ) : null}
              </div>
            </div>

            <div>
              <div className="relative py-1">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-1.5 -translate-y-1/2 rounded-full bg-muted"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-0 top-1/2 z-0 h-1.5 max-w-full -translate-y-1/2 rounded-full bg-muted-foreground/20 transition-[width] duration-200 ease-out motion-reduce:transition-none"
                  style={{ width: `${bufferedEndRatio * 100}%` }}
                />
                <Slider
                  disabled={seekDisabled || caps === null}
                  min={0}
                  max={seekMax}
                  step={0.25}
                  value={seekValue}
                  onValueChange={onSeekSliderChange}
                  onValueCommit={onSeekSliderCommit}
                  className="relative z-10 w-full **:data-[slot=slider-track]:h-1.5 **:data-[slot=slider-track]:bg-transparent **:data-[slot=slider-range]:bg-primary **:data-[slot=slider-thumb]:size-4 **:data-[slot=slider-thumb]:border-border **:data-[slot=slider-thumb]:shadow-sm"
                />
              </div>
              <div className="mt-2 flex justify-between gap-4 tabular-nums text-xs text-muted-foreground">
                <span className="min-w-10">{formatWallClock(elapsed)}</span>
                <span className="min-w-10 text-right">−{formatWallClock(remaining)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {playbackError ? (
        <div
          className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          role="alert"
        >
          <div className="flex items-start gap-2 text-xs text-muted-foreground sm:text-sm">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0 sm:size-4" aria-hidden />
            <span>{playbackError}</span>
          </div>
          <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={playOriginalFile}>
            Play original file
          </Button>
        </div>
      ) : null}

      {showSoftFallbackNotice ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground sm:text-xs" role="status">
          {directPlaybackOnly
            ? "Playing the original upload — adaptive streaming is not available in this browser."
            : "Playing the original upload."}
        </p>
      ) : null}
    </div>
  );
}
