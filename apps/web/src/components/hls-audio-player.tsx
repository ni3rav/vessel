"use client";

import Hls from "hls.js";
import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  hlsUrl: string;
  fallbackUrl: string;
  /** Accessible name for the audio control */
  label: string;
};

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

export function HlsAudioPlayer({ hlsUrl, fallbackUrl, label }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const caps = useAudioPlaybackCaps();
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  /** User explicitly chose to play the original upload after a stream error */
  const [preferOriginalFile, setPreferOriginalFile] = useState(false);

  const directPlaybackOnly = caps !== null && !caps.nativeHls && !caps.mseHls;

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
    audio.src = fallbackUrl;
  }, [fallbackUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || caps === null) return;

    setPlaybackError(null);
    setPreferOriginalFile(false);

    let cancelled = false;

    if (caps.nativeHls) {
      audio.src = hlsUrl;
      const onError = () => {
        if (cancelled) return;
        setPlaybackError("Streaming is unavailable. You can try the original file.");
      };
      audio.addEventListener("error", onError);
      return () => {
        cancelled = true;
        audio.removeEventListener("error", onError);
        cleanupAudio(audio);
      };
    }

    if (caps.mseHls) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(audio);

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

      return () => {
        cancelled = true;
        hls.destroy();
        hlsRef.current = null;
        cleanupAudio(audio);
      };
    }

    audio.src = fallbackUrl;
    return () => {
      cancelled = true;
      cleanupAudio(audio);
    };
  }, [hlsUrl, fallbackUrl, caps]);

  const showSoftFallbackNotice =
    !playbackError && caps !== null && (directPlaybackOnly || preferOriginalFile);

  return (
    <div className="flex w-full flex-col gap-3">
      <audio ref={audioRef} controls className="h-10 w-full" aria-label={label} />
      {playbackError ? (
        <div
          className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>{playbackError}</span>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={playOriginalFile}
          >
            Play original file
          </Button>
        </div>
      ) : null}
      {showSoftFallbackNotice ? (
        <p className="text-xs text-muted-foreground" role="status">
          {directPlaybackOnly
            ? "Playing the original upload — adaptive streaming is not available in this browser."
            : "Playing the original upload."}
        </p>
      ) : null}
    </div>
  );
}
