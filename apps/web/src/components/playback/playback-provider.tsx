"use client";

import Hls from "hls.js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

export type PlaybackStatus = "uploading" | "processing" | "ready" | "failed";

export type PlaybackTrack = {
  id: string;
  title: string;
  subtitle?: string;
  hlsUrl: string;
  fallbackUrl: string;
  status: PlaybackStatus;
};

export type PlaybackEngine = "none" | "native-hls" | "mse-hls" | "direct";

export type QualityChoice = "auto" | number;

export type LevelRow = { index: number; label: string; bitrate: number };

type Interaction = { id: number; section: "seek" | "transport" };

type LoadOptions = { quiet?: boolean; toggleIfSame?: boolean };

export type PlaybackSession = {
  track: PlaybackTrack | null;
  volume: number;
  muted: boolean;
  engine: PlaybackEngine;
  levels: LevelRow[];
  qualityChoice: QualityChoice;
  activeBitrate: number;
  playbackError: string | null;
  preferOriginal: boolean;
  canPrevious: boolean;
  canNext: boolean;
  interaction: Interaction;
  subscribeSkip: (listener: (id: string) => void) => () => void;
  setVolume: (value: number) => void;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  toggle: () => void;
  seekBy: (deltaSeconds: number) => void;
  seekTo: (time: number, options?: { animate?: boolean }) => void;
  previous: () => void;
  next: () => void;
  load: (track: PlaybackTrack, options?: LoadOptions) => void;
  syncLibrary: (tracks: PlaybackTrack[]) => void;
  dismiss: (id: string) => void;
  applyQuality: (value: string) => void;
  playOriginal: () => void;
};

export type PlaybackClock = {
  playing: boolean;
  currentTime: number;
  duration: number;
  bufferedEndRatio: number;
};

const SessionContext = createContext<PlaybackSession | null>(null);
const ClockContext = createContext<PlaybackClock | null>(null);

function subscribeToNothing() {
  return () => {};
}

function useIsClientMounted() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}

function useAudioPlaybackCaps() {
  const mounted = useIsClientMounted();
  return useMemo(() => {
    if (!mounted || typeof window === "undefined") return null;
    const probe = document.createElement("audio");
    const nativeHls =
      probe.canPlayType("application/vnd.apple.mpegurl") !== "" ||
      probe.canPlayType("application/x-mpegURL") !== "";
    return { nativeHls, mseHls: Hls.isSupported() };
  }, [mounted]);
}

function formatBitrate(bps: number) {
  if (!bps || !Number.isFinite(bps)) return "Unknown bitrate";
  return `${Math.round(bps / 1000)} kbps`;
}

function cleanupAudio(audio: HTMLAudioElement) {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function readyNeighbor(queue: PlaybackTrack[], id: string, direction: -1 | 1) {
  const index = queue.findIndex((track) => track.id === id);
  if (index < 0) return null;
  if (direction < 0) {
    return [...queue.slice(0, index)].reverse().find((track) => track.status === "ready") ?? null;
  }
  return queue.slice(index + 1).find((track) => track.status === "ready") ?? null;
}

function sameTrack(a: PlaybackTrack, b: PlaybackTrack) {
  return (
    a.status === b.status &&
    a.hlsUrl === b.hlsUrl &&
    a.fallbackUrl === b.fallbackUrl &&
    a.title === b.title &&
    a.subtitle === b.subtitle
  );
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const caps = useAudioPlaybackCaps();

  const [track, setTrack] = useState<PlaybackTrack | null>(null);
  const [queue, setQueue] = useState<PlaybackTrack[]>([]);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMutedState] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEndRatio, setBufferedEndRatio] = useState(0);
  const [engine, setEngine] = useState<PlaybackEngine>("none");
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [qualityChoice, setQualityChoice] = useState<QualityChoice>("auto");
  const [activeLevelIndex, setActiveLevelIndex] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [preferOriginal, setPreferOriginal] = useState(false);
  const [interaction, setInteraction] = useState<Interaction>({ id: 0, section: "transport" });
  const skipListeners = useRef(new Set<(id: string) => void>());

  const trackRef = useRef(track);
  const queueRef = useRef(queue);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);

  useEffect(() => {
    trackRef.current = track;
    queueRef.current = queue;
    volumeRef.current = volume;
    mutedRef.current = muted;
  }, [muted, queue, track, volume]);

  const signal = useCallback((section: Interaction["section"]) => {
    setInteraction((current) => ({ id: current.id + 1, section }));
  }, []);

  const applyVolume = useEffectEvent(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  });

  const sourceId = track?.status === "ready" ? track.id : null;
  const sourceHls = track?.status === "ready" ? track.hlsUrl : null;
  const sourceFallback = track?.status === "ready" ? track.fallbackUrl : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || caps === null) return;

    setPlaybackError(null);
    setPreferOriginal(false);
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setBufferedEndRatio(0);
    setEngine("none");
    setLevels([]);
    setQualityChoice("auto");
    setActiveLevelIndex(0);

    if (!sourceId || !sourceHls || !sourceFallback) return;

    let cancelled = false;
    let raf = 0;
    const bumpTime = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        const nextTime = audio.currentTime;
        setCurrentTime(nextTime);
        const session = navigator.mediaSession;
        if (!session?.setPositionState) return;
        const length = audio.duration;
        if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(nextTime)) return;
        try {
          session.setPositionState({
            duration: length,
            playbackRate: audio.playbackRate || 1,
            position: Math.min(nextTime, length),
          });
        } catch {
          // Some browsers reject a position that lands past the reported duration.
        }
      });
    };

    const onLoadedMeta = () => {
      const nextDuration = audio.duration;
      setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
      bumpTime();
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onProgress = () => {
      try {
        const length = audio.duration;
        if (!Number.isFinite(length) || length <= 0 || !audio.buffered.length) {
          setBufferedEndRatio(0);
          return;
        }
        const end = audio.buffered.end(audio.buffered.length - 1);
        setBufferedEndRatio(Math.min(1, end / length));
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

    applyVolume();

    if (caps.nativeHls) {
      setEngine("native-hls");
      audio.src = sourceHls;
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
      hls.loadSource(sourceHls);
      hls.attachMedia(audio);

      const syncLevels = () => {
        if (cancelled) return;
        setLevels(
          hls.levels.map((level, index) => ({
            index,
            bitrate: level.bitrate,
            label: level.name?.trim() ? level.name.trim() : formatBitrate(level.bitrate),
          }))
        );
      };

      hls.on(Hls.Events.MANIFEST_PARSED, syncLevels);
      hls.on(Hls.Events.LEVELS_UPDATED, syncLevels);
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
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
    audio.src = sourceFallback;
    return () => {
      cancelled = true;
      detach();
      cleanupAudio(audio);
    };
  }, [caps, sourceFallback, sourceHls, sourceId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [muted, volume]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    const current = trackRef.current;
    if (!audio || !current || current.status !== "ready") return;
    signal("transport");
    if (audio.paused) void audio.play();
    else audio.pause();
  }, [signal]);

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const audio = audioRef.current;
      const current = trackRef.current;
      if (!audio || !current || current.status !== "ready" || !Number.isFinite(audio.duration)) {
        return;
      }
      signal("seek");
      audio.currentTime = Math.min(audio.duration, Math.max(0, audio.currentTime + deltaSeconds));
    },
    [signal]
  );

  const seekTo = useCallback(
    (time: number, options?: { animate?: boolean }) => {
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(audio.duration)) return;
      if (options?.animate) signal("seek");
      audio.currentTime = Math.min(audio.duration, Math.max(0, time));
    },
    [signal]
  );

  const load = useCallback(
    (next: PlaybackTrack, options?: LoadOptions) => {
      const current = trackRef.current;
      if (
        current &&
        current.id === next.id &&
        current.hlsUrl === next.hlsUrl &&
        current.status === next.status
      ) {
        if (options?.toggleIfSame) toggle();
        return;
      }
      trackRef.current = next;
      setTrack(next);
      if (!options?.quiet) signal("transport");
    },
    [signal, toggle]
  );

  const skip = useCallback(
    (direction: -1 | 1) => {
      const current = trackRef.current;
      if (!current) return;
      const next = readyNeighbor(queueRef.current, current.id, direction);
      if (!next) return;
      trackRef.current = next;
      setTrack(next);
      signal("transport");
      for (const listener of skipListeners.current) listener(next.id);
    },
    [signal]
  );

  const subscribeSkip = useCallback((listener: (id: string) => void) => {
    const listeners = skipListeners.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const previous = useCallback(() => skip(-1), [skip]);
  const next = useCallback(() => skip(1), [skip]);

  const syncLibrary = useCallback((tracks: PlaybackTrack[]) => {
    queueRef.current = tracks;
    setQueue(tracks);
    setTrack((current) => {
      if (!current) return current;
      const next = tracks.find((item) => item.id === current.id);
      if (!next) return null;
      return sameTrack(current, next) ? current : next;
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setQueue((items) => items.filter((item) => item.id !== id));
    setTrack((current) => (current?.id === id ? null : current));
  }, []);

  const applyQuality = useCallback(
    (value: string) => {
      const hls = hlsRef.current;
      if (!hls) return;
      if (value === "auto") {
        hls.loadLevel = -1;
        setQualityChoice("auto");
        signal("seek");
        return;
      }
      const index = Number.parseInt(value, 10);
      if (!Number.isFinite(index)) return;
      hls.loadLevel = index;
      setQualityChoice(index);
      signal("seek");
    },
    [signal]
  );

  const playOriginal = useCallback(() => {
    const audio = audioRef.current;
    const current = trackRef.current;
    if (!audio || !current) return;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    cleanupAudio(audio);
    setPreferOriginal(true);
    setPlaybackError(null);
    setLevels([]);
    setQualityChoice("auto");
    audio.volume = volumeRef.current;
    audio.muted = mutedRef.current;
    audio.src = current.fallbackUrl;
    setEngine("direct");
    signal("seek");
  }, [signal]);

  const setVolume = useCallback((value: number) => {
    setVolumeState(Math.min(1, Math.max(0, value)));
  }, []);

  const setMuted = useCallback(
    (next: boolean) => {
      if (mutedRef.current === next) return;
      mutedRef.current = next;
      setMutedState(next);
      signal("transport");
    },
    [signal]
  );

  const toggleMuted = useCallback(() => {
    setMuted(!mutedRef.current);
  }, [setMuted]);

  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const key = event.key;
    const lower = key.toLowerCase();

    if (target?.closest("[role='menu']")) return;
    if (target?.closest("button") && key === " ") return;
    if (target?.closest("[data-slot=volume-control]")) return;
    if (
      target?.closest("[data-slot=waveform], [data-slot=slider-thumb], input[type='range']") &&
      (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown")
    ) {
      return;
    }

    if (lower === "j") {
      event.preventDefault();
      previous();
      return;
    }
    if (lower === "k") {
      event.preventDefault();
      next();
      return;
    }
    if (key === " " && trackRef.current?.status === "ready") {
      event.preventDefault();
      toggle();
      return;
    }
    if (key === "ArrowLeft" && trackRef.current?.status === "ready") {
      event.preventDefault();
      seekBy(-5);
      return;
    }
    if (key === "ArrowRight" && trackRef.current?.status === "ready") {
      event.preventDefault();
      seekBy(5);
    }
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const session = navigator.mediaSession;
    if (!session) return;
    const current = track;
    if (!current) {
      session.metadata = null;
      session.playbackState = "none";
      return;
    }
    session.metadata = new MediaMetadata({
      title: current.title,
      artist: current.subtitle || "Vessel",
    });
    session.playbackState = playing ? "playing" : "paused";

    const bind = (action: MediaSessionAction, run: () => void) => {
      try {
        session.setActionHandler(action, run);
      } catch {
        // This action is not supported in every browser.
      }
    };
    bind("play", toggle);
    bind("pause", toggle);
    bind("previoustrack", previous);
    bind("nexttrack", next);
    bind("seekbackward", () => seekBy(-5));
    bind("seekforward", () => seekBy(5));

    return () => {
      const clear = (action: MediaSessionAction) => {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Ignore unsupported actions while cleaning up.
        }
      };
      clear("play");
      clear("pause");
      clear("previoustrack");
      clear("nexttrack");
      clear("seekbackward");
      clear("seekforward");
    };
  }, [next, playing, previous, seekBy, toggle, track]);

  const canPrevious = Boolean(track && readyNeighbor(queue, track.id, -1));
  const canNext = Boolean(track && readyNeighbor(queue, track.id, 1));
  const activeBitrate =
    engine === "mse-hls" && levels.length > 0
      ? (levels[Math.min(activeLevelIndex, levels.length - 1)]?.bitrate ?? 0)
      : 0;

  const session = useMemo<PlaybackSession>(
    () => ({
      activeBitrate,
      applyQuality,
      canNext,
      canPrevious,
      dismiss,
      engine,
      interaction,
      levels,
      load,
      muted,
      next,
      playOriginal,
      playbackError,
      preferOriginal,
      previous,
      qualityChoice,
      seekBy,
      seekTo,
      setMuted,
      setVolume,
      subscribeSkip,
      syncLibrary,
      toggle,
      toggleMuted,
      track,
      volume,
    }),
    [
      activeBitrate,
      applyQuality,
      canNext,
      canPrevious,
      dismiss,
      engine,
      interaction,
      levels,
      load,
      muted,
      next,
      playOriginal,
      playbackError,
      preferOriginal,
      previous,
      qualityChoice,
      seekBy,
      seekTo,
      setMuted,
      setVolume,
      subscribeSkip,
      syncLibrary,
      toggle,
      toggleMuted,
      track,
      volume,
    ]
  );

  const clock = useMemo<PlaybackClock>(
    () => ({ bufferedEndRatio, currentTime, duration, playing }),
    [bufferedEndRatio, currentTime, duration, playing]
  );

  return (
    <SessionContext.Provider value={session}>
      <ClockContext.Provider value={clock}>
        <audio
          ref={audioRef}
          preload="metadata"
          playsInline
          aria-label={track?.title ?? "Audio player"}
          className="sr-only"
        />
        {children}
      </ClockContext.Provider>
    </SessionContext.Provider>
  );
}

export function usePlaybackSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("usePlaybackSession must be used inside PlaybackProvider");
  return session;
}

export function usePlaybackClock() {
  const clock = useContext(ClockContext);
  if (!clock) throw new Error("usePlaybackClock must be used inside PlaybackProvider");
  return clock;
}
