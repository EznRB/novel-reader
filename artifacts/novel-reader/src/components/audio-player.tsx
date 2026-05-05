import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Square, SkipBack, SkipForward, Volume2, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export interface Voice {
  Name: string;
  ShortName: string;
  Gender: string;
  Locale: string;
  FriendlyName: string;
}

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

interface AudioPlayerProps {
  sentences: string[];
  currentIdx: number;
  onSentenceChange: (idx: number) => void;
  voice: string;
  rate: number;
  onVoiceChange: (v: string) => void;
  onRateChange: (r: number) => void;
  voices: Voice[];
  voicesLoading: boolean;
  disabled?: boolean;
}

function WaveformViz() {
  return (
    <div className="flex items-end gap-0.5 h-5" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="waveform-bar" style={{ animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  );
}

function buildTTSUrl(text: string, voice: string, rate: number): string {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api/tts/synthesize`;
}

async function fetchAudioBlob(text: string, voice: string, rate: number): Promise<string> {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const res = await fetch(`${base}/api/tts/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.trim(), voice, rate }),
  });
  if (!res.ok) throw new Error(`TTS error ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function AudioPlayer({
  sentences,
  currentIdx,
  onSentenceChange,
  voice,
  rate,
  onVoiceChange,
  onRateChange,
  voices,
  voicesLoading,
  disabled,
}: AudioPlayerProps) {
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const prefetchUrlRef = useRef<string | null>(null);
  const prefetchIdxRef = useRef<number>(-1);
  const playingIdxRef = useRef<number>(-1);
  const shouldPlayRef = useRef(false);

  const revokeUrl = (url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  };

  const stopAudio = useCallback(() => {
    shouldPlayRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    revokeUrl(currentUrlRef.current);
    revokeUrl(prefetchUrlRef.current);
    currentUrlRef.current = null;
    prefetchUrlRef.current = null;
    prefetchIdxRef.current = -1;
    playingIdxRef.current = -1;
    setStatus("idle");
  }, []);

  // Prefetch next sentence
  const prefetchNext = useCallback(async (idx: number) => {
    if (idx >= sentences.length || idx === prefetchIdxRef.current) return;
    prefetchIdxRef.current = idx;
    try {
      const url = await fetchAudioBlob(sentences[idx], voice, rate);
      revokeUrl(prefetchUrlRef.current);
      prefetchUrlRef.current = url;
    } catch {
      prefetchUrlRef.current = null;
    }
  }, [sentences, voice, rate]);

  const playSentence = useCallback(async (idx: number) => {
    if (idx >= sentences.length || !sentences[idx]?.trim()) {
      stopAudio();
      return;
    }

    setStatus("loading");
    playingIdxRef.current = idx;
    onSentenceChange(idx);

    try {
      let url: string;
      if (prefetchIdxRef.current === idx && prefetchUrlRef.current) {
        url = prefetchUrlRef.current;
        prefetchUrlRef.current = null;
        prefetchIdxRef.current = -1;
      } else {
        url = await fetchAudioBlob(sentences[idx], voice, rate);
      }

      if (!shouldPlayRef.current) { revokeUrl(url); return; }

      revokeUrl(currentUrlRef.current);
      currentUrlRef.current = url;

      const audio = audioRef.current!;
      audio.src = url;
      audio.playbackRate = 1;
      await audio.play();
      setStatus("playing");

      // Prefetch next
      prefetchNext(idx + 1);
    } catch (err) {
      console.error("TTS play error:", err);
      if (shouldPlayRef.current) setStatus("error");
    }
  }, [sentences, voice, rate, onSentenceChange, stopAudio, prefetchNext]);

  const handleEnded = useCallback(() => {
    if (!shouldPlayRef.current) return;
    const next = playingIdxRef.current + 1;
    if (next < sentences.length) {
      playSentence(next);
    } else {
      stopAudio();
    }
  }, [sentences.length, playSentence, stopAudio]);

  // Wire audio element
  useEffect(() => {
    const audio = new Audio();
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", () => {
      if (shouldPlayRef.current) setStatus("error");
    });
    audioRef.current = audio;
    return () => {
      shouldPlayRef.current = false;
      audio.pause();
      audio.removeEventListener("ended", handleEnded);
      revokeUrl(currentUrlRef.current);
      revokeUrl(prefetchUrlRef.current);
    };
  }, [handleEnded]);

  const play = () => {
    shouldPlayRef.current = true;
    playSentence(currentIdx);
  };

  const pause = () => {
    shouldPlayRef.current = false;
    audioRef.current?.pause();
    setStatus("paused");
  };

  const resume = () => {
    shouldPlayRef.current = true;
    if (audioRef.current && audioRef.current.src && status === "paused") {
      audioRef.current.play().then(() => setStatus("playing")).catch(() => play());
    } else {
      play();
    }
  };

  const stop = () => stopAudio();

  const skipBack = () => {
    const newIdx = Math.max(0, currentIdx - 1);
    if (shouldPlayRef.current) {
      playSentence(newIdx);
    } else {
      onSentenceChange(newIdx);
    }
  };

  const skipForward = () => {
    const newIdx = Math.min(sentences.length - 1, currentIdx + 1);
    if (shouldPlayRef.current) {
      playSentence(newIdx);
    } else {
      onSentenceChange(newIdx);
    }
  };

  const isPlaying = status === "playing";
  const isLoading = status === "loading";

  // English voices first, then all others
  const englishVoices = voices.filter((v) => v.Locale.startsWith("en-"));
  const otherVoices = voices.filter((v) => !v.Locale.startsWith("en-"));

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">
          {currentIdx + 1} / {sentences.length}
        </span>
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="progress-bar-fill"
            style={{ width: `${((currentIdx + 1) / Math.max(1, sentences.length)) * 100}%` }}
          />
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Play controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="icon"
            onClick={skipBack}
            disabled={disabled || currentIdx <= 0}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            data-testid="btn-skip-back"
          >
            <SkipBack className="w-4 h-4" />
          </Button>

          {isLoading ? (
            <div className="h-10 w-10 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : isPlaying ? (
            <Button
              size="icon"
              onClick={pause}
              className="h-10 w-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full"
              data-testid="btn-pause"
            >
              <Pause className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={status === "paused" ? resume : play}
              disabled={disabled || sentences.length === 0}
              className="h-10 w-10 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full"
              data-testid="btn-play"
            >
              <Play className="w-4 h-4 ml-0.5" />
            </Button>
          )}

          <Button
            variant="ghost" size="icon"
            onClick={skipForward}
            disabled={disabled || currentIdx >= sentences.length - 1}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            data-testid="btn-skip-forward"
          >
            <SkipForward className="w-4 h-4" />
          </Button>

          {(isPlaying || isLoading) && (
            <Button
              variant="ghost" size="icon"
              onClick={stop}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              data-testid="btn-stop"
            >
              <Square className="w-4 h-4" />
            </Button>
          )}

          {isPlaying && <WaveformViz />}
        </div>

        {/* Speed + Voice */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Rate slider */}
          <div className="flex items-center gap-2 min-w-[160px]">
            <Volume2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Slider
              value={[rate]}
              min={-50}
              max={50}
              step={5}
              onValueChange={([v]) => { onRateChange(v); if (isPlaying) { stop(); } }}
              className="w-28"
              data-testid="slider-rate"
            />
            <span className="text-xs text-muted-foreground w-12 shrink-0 font-mono">
              {rate > 0 ? "+" : ""}{rate}%
            </span>
          </div>

          {/* Voice selector */}
          {!voicesLoading && voices.length > 0 && (
            <Select
              value={voice}
              onValueChange={(v) => { onVoiceChange(v); if (isPlaying) stop(); }}
            >
              <SelectTrigger className="h-8 text-xs w-48 bg-secondary border-border" data-testid="select-voice">
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {englishVoices.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs text-muted-foreground font-semibold uppercase tracking-wide">English</div>
                    {englishVoices.slice(0, 30).map((v) => (
                      <SelectItem key={v.ShortName} value={v.ShortName} className="text-xs">
                        {v.FriendlyName}
                      </SelectItem>
                    ))}
                  </>
                )}
                {otherVoices.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs text-muted-foreground font-semibold uppercase tracking-wide mt-1">Other</div>
                    {otherVoices.slice(0, 20).map((v) => (
                      <SelectItem key={v.ShortName} value={v.ShortName} className="text-xs">
                        {v.FriendlyName}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          )}
          {voicesLoading && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading voices...
            </span>
          )}
        </div>
      </div>

      {status === "error" && (
        <p className="text-xs text-destructive">TTS error — check your connection and try again.</p>
      )}
    </div>
  );
}
