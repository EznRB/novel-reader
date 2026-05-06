import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Square, SkipBack, SkipForward, Volume2, Loader2, Sparkles } from "lucide-react";
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

type VoiceStyle = "narration" | "cheerful" | "sad" | "excited" | "angry" | "whisper" | "dialogue";

const STYLE_LABELS: Record<VoiceStyle, string> = {
  narration: "Narrating",
  dialogue:  "Dialogue",
  cheerful:  "Cheerful",
  sad:       "Somber",
  excited:   "Excited",
  angry:     "Intense",
  whisper:   "Hushed",
};

const STYLE_COLORS: Record<VoiceStyle, string> = {
  narration: "text-muted-foreground",
  dialogue:  "text-blue-400",
  cheerful:  "text-yellow-400",
  sad:       "text-indigo-400",
  excited:   "text-orange-400",
  angry:     "text-red-400",
  whisper:   "text-violet-400",
};

function detectStyle(text: string): VoiceStyle {
  const s = text.trim();

  // Dialogue: quoted speech or short question
  if (/[""\u201C\u201D\u2018\u2019'']/.test(s)) return "dialogue";
  if (s.endsWith("?") && s.length < 90) return "dialogue";

  // Exclamation
  if (s.endsWith("!")) {
    const angryCues = /\b(never|die|kill|destroy|fool|idiot|coward|traitor|damn|enough|how dare|impossible|you dare)\b/i;
    return angryCues.test(s) ? "angry" : "excited";
  }

  // Sad / grief
  const sadCues = /\b(died?|death|dead|lost|grief|tear|wept?|cried?|sorrow|pain|heartbreak|alone|lonely|miss|gone forever|helpless|hopeless|despair|mourn|suffer|agony|anguish)\b/i;
  if (sadCues.test(s)) return "sad";

  // Fear / tension
  const fearCues = /\b(terrif|horror|fear|afraid|trembl|shiver|monster|demon|threaten|danger|flee|escape|alarm|shadow|darkness|chill|ghostly)\b/i;
  if (fearCues.test(s)) return "angry";

  // Action / battle
  const actionCues = /\b(attack|fight|battle|clash|rush|charge|explo|shatter|slash|pierce|struck|blood|wound|combat|crush|defeat|sword|punch|blade|burst|collide)\b/i;
  if (actionCues.test(s)) return "excited";

  return "narration";
}

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
  immersive?: boolean;
  onPlayingChange?: (playing: boolean) => void;
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

async function fetchAudioBlob(text: string, voice: string, rate: number, style: string): Promise<string> {
  const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  const res = await fetch(`${base}/api/tts/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.trim(), voice, rate, style }),
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
  immersive = false,
  onPlayingChange,
}: AudioPlayerProps) {
  const [status, setStatus] = useState<PlayerStatus>("idle");
  const [currentStyle, setCurrentStyle] = useState<VoiceStyle>("narration");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const prefetchUrlRef = useRef<string | null>(null);
  const prefetchIdxRef = useRef<number>(-1);
  const prefetchStyleRef = useRef<string>("narration");
  const playingIdxRef = useRef<number>(-1);
  const shouldPlayRef = useRef(false);

  const revokeUrl = (url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  };

  // Notify parent when playing state changes
  useEffect(() => {
    onPlayingChange?.(status === "playing");
  }, [status, onPlayingChange]);

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
    prefetchStyleRef.current = "narration";
    playingIdxRef.current = -1;
    setStatus("idle");
    setCurrentStyle("narration");
  }, []);

  const prefetchNext = useCallback(async (idx: number) => {
    if (idx >= sentences.length || idx === prefetchIdxRef.current) return;
    const style = immersive ? detectStyle(sentences[idx]) : "narration";
    if (idx === prefetchIdxRef.current && style === prefetchStyleRef.current) return;
    prefetchIdxRef.current = idx;
    prefetchStyleRef.current = style;
    try {
      const url = await fetchAudioBlob(sentences[idx], voice, rate, style);
      revokeUrl(prefetchUrlRef.current);
      prefetchUrlRef.current = url;
    } catch {
      prefetchUrlRef.current = null;
    }
  }, [sentences, voice, rate, immersive]);

  const playSentence = useCallback(async (idx: number) => {
    if (idx >= sentences.length || !sentences[idx]?.trim()) {
      stopAudio();
      return;
    }

    const style = immersive ? detectStyle(sentences[idx]) : "narration";
    setStatus("loading");
    setCurrentStyle(style as VoiceStyle);
    playingIdxRef.current = idx;
    onSentenceChange(idx);

    try {
      let url: string;
      if (
        prefetchIdxRef.current === idx &&
        prefetchStyleRef.current === style &&
        prefetchUrlRef.current
      ) {
        url = prefetchUrlRef.current;
        prefetchUrlRef.current = null;
        prefetchIdxRef.current = -1;
      } else {
        url = await fetchAudioBlob(sentences[idx], voice, rate, style);
      }

      if (!shouldPlayRef.current) { revokeUrl(url); return; }

      revokeUrl(currentUrlRef.current);
      currentUrlRef.current = url;

      const audio = audioRef.current!;
      audio.src = url;
      audio.playbackRate = 1;
      await audio.play();
      setStatus("playing");

      prefetchNext(idx + 1);
    } catch (err) {
      console.error("TTS play error:", err);
      if (shouldPlayRef.current) setStatus("error");
    }
  }, [sentences, voice, rate, onSentenceChange, stopAudio, prefetchNext, immersive]);

  const handleEnded = useCallback(() => {
    if (!shouldPlayRef.current) return;
    const next = playingIdxRef.current + 1;
    if (next < sentences.length) {
      playSentence(next);
    } else {
      stopAudio();
    }
  }, [sentences.length, playSentence, stopAudio]);

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
    if (shouldPlayRef.current) playSentence(newIdx);
    else onSentenceChange(newIdx);
  };

  const skipForward = () => {
    const newIdx = Math.min(sentences.length - 1, currentIdx + 1);
    if (shouldPlayRef.current) playSentence(newIdx);
    else onSentenceChange(newIdx);
  };

  const isPlaying = status === "playing";
  const isLoading = status === "loading";

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
        {/* Immersive style badge */}
        {immersive && isPlaying && (
          <div className={`flex items-center gap-1 text-[10px] font-medium shrink-0 ${STYLE_COLORS[currentStyle]}`}>
            <Sparkles className="w-3 h-3" />
            <span>{STYLE_LABELS[currentStyle]}</span>
          </div>
        )}
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
          <div className="flex items-center gap-2 min-w-[160px]">
            <Volume2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Slider
              value={[rate]}
              min={-50}
              max={50}
              step={5}
              onValueChange={([v]) => { onRateChange(v); if (isPlaying) stop(); }}
              className="w-28"
              data-testid="slider-rate"
            />
            <span className="text-xs text-muted-foreground w-12 shrink-0 font-mono">
              {rate > 0 ? "+" : ""}{rate}%
            </span>
          </div>

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
