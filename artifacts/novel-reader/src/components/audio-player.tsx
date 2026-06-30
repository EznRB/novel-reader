/**
 * AudioPlayer
 *
 * Architecture notes:
 * - The HTMLAudioElement is created ONCE on mount (empty deps in useEffect).
 * - All prop values that change over time are mirrored into refs so stable
 *   callbacks can always read the latest value without becoming dependencies.
 * - This prevents the "Audio recreated mid-play → shouldPlayRef reset → stuck
 *   on loading" bug that occurred when sentences/voice/rate changed.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Play, Pause, Square, SkipBack, SkipForward,
  Volume2, Loader2, Sparkles,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/* ── Types ── */
export interface Voice {
  Name: string;
  ShortName: string;
  Gender: string;
  Locale: string;
  FriendlyName: string;
}

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

type VoiceStyle =
  | "narration" | "cheerful" | "sad"
  | "excited"  | "angry"   | "whisper" | "dialogue";

const STYLE_LABELS: Record<VoiceStyle, string> = {
  narration: "Narrando",
  dialogue:  "Diálogo",
  cheerful:  "Animado",
  sad:       "Melancólico",
  excited:   "Empolgado",
  angry:     "Intenso",
  whisper:   "Sussurro",
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

/* ── Detecção de entonação (pt-BR + EN) ── */
function detectStyle(text: string): VoiceStyle {
  const s = text.trim();

  // Diálogo — aspas de qualquer tipo
  if (/[""\u201C\u201D\u2018\u2019'']/.test(s)) return "dialogue";
  if (s.endsWith("?") && s.length < 100) return "dialogue";

  // Exclamação — distingue raiva de empolgação
  if (s.endsWith("!")) {
    const angry = /\b(nunca|morra|morra|mata|destrua|idiota|covarde|traidor|maldito|basta|como ousa|impossível|ouse|insolente|never|die|kill|destroy|fool|idiot|coward|traitor|damn|enough|how dare|impossible)\b/i;
    return angry.test(s) ? "angry" : "excited";
  }

  // Tristeza / pesar
  if (/\b(morr(eu|eu)|morte|mort(o|a)|perdi|perdeu|lágrima|chorou|chorava|dor|saudade|sozinho|sozinha|sofrimento|tristeza|desespero|angústia|pranto|lamentou|luto|lamentação|died?|death|dead|lost|grief|tear|wept?|cried?|sorrow|pain|heartbreak|alone|lonely|miss|gone forever|helpless|hopeless|despair|mourn|suffer|agony|anguish)\b/i.test(s)) return "sad";

  // Terror / ameaça / sombra
  if (/\b(terror|medo|assustou|tremeu|tremia|monstro|demônio|ameaça|perigo|fugiu|fuga|sombra|trevas|arrepio|espectro|fantasma|terrif|horror|fear|afraid|trembl|shiver|monster|demon|threaten|danger|flee|escape|alarm|shadow|darkness|chill|ghostly)\b/i.test(s)) return "angry";

  // Combate / ação intensa
  if (/\b(atacou|atacar|lutou|luta|batalha|combate|golpe|explosão|explodiu|sangue|ferido|ferimento|esmagou|cortou|perfurou|vitória|derrotou|rasgou|colidiu|attack|fight|battle|clash|rush|charge|explo|shatter|slash|pierce|struck|blood|wound|combat|crush|defeat|sword|punch|blade|burst|collide)\b/i.test(s)) return "excited";

  // Sussurro / segredo
  if (/\b(sussurrou|sussurrava|segredo|discretamente|sigiloso|baixinho|whisper|murmur|quietly|secret)\b/i.test(s)) return "whisper";

  return "narration";
}

/* ── Waveform animation ── */
function WaveformViz() {
  return (
    <div className="flex items-end gap-0.5 h-5" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="waveform-bar" style={{ animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  );
}

/* ── Props ── */
export interface AudioPlayerProps {
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
  /** Chamado quando a última frase do capítulo termina de tocar */
  onChapterComplete?: () => void;
}

/* ── Component ── */
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
  onChapterComplete,
}: AudioPlayerProps) {
  const [status, setStatus]           = useState<PlayerStatus>("idle");
  const [currentStyle, setCurrentStyle] = useState<VoiceStyle>("narration");

  /* ── Stable refs for props (updated every render — no stale closures) ── */
  const sentencesRef           = useRef(sentences);
  const voiceRef               = useRef(voice);
  const rateRef                = useRef(rate);
  const immersiveRef           = useRef(immersive);
  const onSentenceChangeRef    = useRef(onSentenceChange);
  const onChapterCompleteRef   = useRef(onChapterComplete);
  sentencesRef.current           = sentences;
  voiceRef.current               = voice;
  rateRef.current                = rate;
  immersiveRef.current           = immersive;
  onSentenceChangeRef.current    = onSentenceChange;
  onChapterCompleteRef.current   = onChapterComplete;

  /* ── Playback state refs ── */
  const audioRef         = useRef<HTMLAudioElement | null>(null);
  const shouldPlayRef    = useRef(false);
  const playingIdxRef    = useRef(-1);
  const currentUrlRef    = useRef<string | null>(null);
  const prefetchUrlRef   = useRef<string | null>(null);
  const prefetchIdxRef   = useRef(-1);
  const prefetchStyleRef = useRef("narration");

  /* ── Ref used by the stable onEnded handler to call playSentence ── */
  const playSentenceRef = useRef<(idx: number) => void>(() => {});

  const revokeUrl = (url: string | null) => { if (url) URL.revokeObjectURL(url); };

  /* ── Notify parent of play state ── */
  useEffect(() => {
    onPlayingChange?.(status === "playing");
  }, [status, onPlayingChange]);

  /* ── Create HTMLAudioElement exactly once ── */
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onEnded = () => {
      if (!shouldPlayRef.current) return;
      const next = playingIdxRef.current + 1;
      if (next < sentencesRef.current.length) {
        playSentenceRef.current(next);
      } else {
        shouldPlayRef.current = false;
        playingIdxRef.current = -1;
        setStatus("idle");
        setCurrentStyle("narration");
        onChapterCompleteRef.current?.();
      }
    };

    const onError = () => {
      if (shouldPlayRef.current) setStatus("error");
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      shouldPlayRef.current = false;
      audio.pause();
      audio.src = "";
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      revokeUrl(currentUrlRef.current);
      revokeUrl(prefetchUrlRef.current);
    };
  }, []); // ← empty: Audio lives for the component lifetime

  /* ── Fetch audio blob (stable — reads voice/rate from refs) ── */
  const fetchAudio = useCallback(async (text: string, style: string): Promise<string> => {
    const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
    const res = await fetch(`${base}/api/tts/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.trim(),
        voice: voiceRef.current,
        rate:  rateRef.current,
        style,
      }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      throw new Error(`TTS ${res.status}: ${msg}`);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }, []); // stable

  /* ── Stop playback ── */
  const stopAudio = useCallback(() => {
    shouldPlayRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    revokeUrl(currentUrlRef.current);
    revokeUrl(prefetchUrlRef.current);
    currentUrlRef.current  = null;
    prefetchUrlRef.current = null;
    prefetchIdxRef.current = -1;
    playingIdxRef.current  = -1;
    setStatus("idle");
    setCurrentStyle("narration");
  }, []); // stable

  /* ── Prefetch next sentence ── */
  const prefetchNext = useCallback(async (idx: number) => {
    const sents = sentencesRef.current;
    if (idx >= sents.length || !sents[idx]?.trim()) return;
    const style = immersiveRef.current ? detectStyle(sents[idx]) : "narration";
    if (prefetchIdxRef.current === idx && prefetchStyleRef.current === style && prefetchUrlRef.current) return;
    prefetchIdxRef.current   = idx;
    prefetchStyleRef.current = style;
    try {
      const url = await fetchAudio(sents[idx], style);
      revokeUrl(prefetchUrlRef.current);
      prefetchUrlRef.current = url;
    } catch {
      prefetchUrlRef.current = null;
      prefetchIdxRef.current = -1;
    }
  }, [fetchAudio]); // stable

  /* ── Play a specific sentence ── */
  const playSentence = useCallback(async (idx: number) => {
    const sents = sentencesRef.current;
    if (idx >= sents.length || !sents[idx]?.trim()) {
      stopAudio();
      return;
    }

    const style = immersiveRef.current ? detectStyle(sents[idx]) : "narration";
    setStatus("loading");
    setCurrentStyle(style as VoiceStyle);
    playingIdxRef.current = idx;
    onSentenceChangeRef.current(idx);

    try {
      let url: string;

      if (
        prefetchIdxRef.current   === idx &&
        prefetchStyleRef.current === style &&
        prefetchUrlRef.current
      ) {
        url = prefetchUrlRef.current;
        prefetchUrlRef.current = null;
        prefetchIdxRef.current = -1;
      } else {
        url = await fetchAudio(sents[idx], style);
      }

      if (!shouldPlayRef.current) {
        revokeUrl(url);
        setStatus("idle");
        return;
      }

      revokeUrl(currentUrlRef.current);
      currentUrlRef.current = url;

      const audio = audioRef.current!;
      audio.src = url;
      audio.load();
      await audio.play();
      setStatus("playing");

      prefetchNext(idx + 1);

    } catch (err) {
      console.error("[AudioPlayer] playback error:", err);
      setStatus(shouldPlayRef.current ? "error" : "idle");
    }
  }, [fetchAudio, stopAudio, prefetchNext]); // stable

  /* ── Keep playSentenceRef in sync ── */
  useEffect(() => {
    playSentenceRef.current = playSentence;
  }, [playSentence]);

  /* ── Public controls ── */
  const play = useCallback(() => {
    shouldPlayRef.current = true;
    playSentenceRef.current(currentIdx);
  }, [currentIdx]);

  const pause = useCallback(() => {
    shouldPlayRef.current = false;
    audioRef.current?.pause();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    shouldPlayRef.current = true;
    const audio = audioRef.current;
    if (audio && audio.src && status === "paused") {
      audio.play()
        .then(() => setStatus("playing"))
        .catch(() => { shouldPlayRef.current = true; playSentenceRef.current(currentIdx); });
    } else {
      playSentenceRef.current(currentIdx);
    }
  }, [currentIdx, status]);

  const skipBack = useCallback(() => {
    const newIdx = Math.max(0, currentIdx - 1);
    if (shouldPlayRef.current) {
      playSentenceRef.current(newIdx);
    } else {
      onSentenceChangeRef.current(newIdx);
    }
  }, [currentIdx]);

  const skipForward = useCallback(() => {
    const newIdx = Math.min(sentences.length - 1, currentIdx + 1);
    if (shouldPlayRef.current) {
      playSentenceRef.current(newIdx);
    } else {
      onSentenceChangeRef.current(newIdx);
    }
  }, [currentIdx, sentences.length]);

  const isPlaying = status === "playing";
  const isLoading = status === "loading";

  // Prioriza vozes pt-BR, depois outros idiomas
  const ptBRVoices  = voices.filter((v) => v.Locale.startsWith("pt-BR") || v.Locale.startsWith("pt-PT"));
  const otherVoices = voices.filter((v) => !v.Locale.startsWith("pt-"));

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Barra de progresso */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-muted-foreground w-16 shrink-0">
          {currentIdx + 1} / {sentences.length}
        </span>
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="progress-bar-fill transition-all duration-300"
            style={{ width: `${((currentIdx + 1) / Math.max(1, sentences.length)) * 100}%` }}
          />
        </div>
        {immersive && isPlaying && (
          <div className={`flex items-center gap-1 text-[10px] font-medium shrink-0 ${STYLE_COLORS[currentStyle]}`}>
            <Sparkles className="w-3 h-3" />
            <span>{STYLE_LABELS[currentStyle]}</span>
          </div>
        )}
      </div>

      {/* Controles */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
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
              size="icon" onClick={pause}
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
              variant="ghost" size="icon" onClick={stopAudio}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              data-testid="btn-stop"
            >
              <Square className="w-4 h-4" />
            </Button>
          )}

          {isPlaying && <WaveformViz />}
        </div>

        {/* Velocidade + seletor de voz */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-[160px]">
            <Volume2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Slider
              value={[rate]}
              min={-50} max={50} step={5}
              onValueChange={([v]) => { onRateChange(v); if (isPlaying) stopAudio(); }}
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
              onValueChange={(v) => { onVoiceChange(v); if (isPlaying) stopAudio(); }}
            >
              <SelectTrigger className="h-8 text-xs w-52 bg-secondary border-border" data-testid="select-voice">
                <SelectValue placeholder="Selecionar voz" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {ptBRVoices.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                      Português (Brasil)
                    </div>
                    {ptBRVoices.slice(0, 20).map((v) => (
                      <SelectItem key={v.ShortName} value={v.ShortName} className="text-xs">
                        {v.FriendlyName}
                      </SelectItem>
                    ))}
                  </>
                )}
                {otherVoices.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs text-muted-foreground font-semibold uppercase tracking-wide mt-1">
                      Outros Idiomas
                    </div>
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
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Carregando vozes…
            </span>
          )}
        </div>
      </div>

      {status === "error" && (
        <p className="text-xs text-destructive">
          Erro de áudio — verifique sua conexão e tente novamente.
        </p>
      )}
    </div>
  );
}
