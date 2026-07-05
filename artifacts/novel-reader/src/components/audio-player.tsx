/**
 * AudioPlayer — Sistema de narração automático
 *
 * - Sem seleção manual de voz: tudo é automático
 * - Voz do narrador fixa (pt-BR-AntonioNeural)
 * - Retry automático (até 2x) em falhas de TTS
 * - Auto-skip para próxima frase em caso de falha persistente
 * - AbortController com timeout de 45s por requisição
 * - Pré-carrega a próxima frase durante a reprodução atual
 */
// @ts-nocheck
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ENABLE_BLOCK_AUDIO } from "@workspace/config/featureFlags";
import {
  Play, Pause, Square, SkipBack, SkipForward,
  Loader2, Sparkles, Gauge,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";

/* ── Tipos ── */
export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

type VoiceStyle =
  | "narration" | "dialogue" | "cheerful" | "sad"
  | "excited"   | "angry"   | "whisper";

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

/* ── Detecção de estilo para modo cinemático (pt-BR + EN) ── */
function detectStyle(text: string): VoiceStyle {
  const s = text.trim();

  if (/[""\u201C\u201D\u2018\u2019'']/.test(s)) return "dialogue";
  if (s.endsWith("?") && s.length < 100) return "dialogue";

  if (s.endsWith("!")) {
    const angry = /\b(nunca|morra|mata|destrua|idiota|covarde|traidor|maldito|basta|como ousa|impossível|never|die|kill|destroy|fool|coward|traitor|damn|enough|how dare)\b/i;
    return angry.test(s) ? "angry" : "excited";
  }

  if (/\b(morreu|morte|morto|perdi|perdeu|lágrima|chorou|dor|saudade|sozinho|sofrimento|tristeza|desespero|angústia|died?|death|lost|grief|tear|wept?|sorrow|pain|alone|despair)\b/i.test(s)) return "sad";
  if (/\b(terror|medo|tremeu|monstro|demônio|ameaça|perigo|sombra|trevas|arrepio|fear|afraid|trembl|monster|demon|danger|shadow|chill)\b/i.test(s)) return "angry";
  if (/\b(atacou|lutou|batalha|combate|explosão|sangue|ferido|vitória|attack|fight|battle|explo|blood|wound|combat)\b/i.test(s)) return "excited";
  if (/\b(sussurrou|segredo|discretamente|sigiloso|whisper|murmur|quietly|secret)\b/i.test(s)) return "whisper";

  return "narration";
}

/* ── Animação de onda ── */
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
  voice?: string;
  /** Voz por índice de frase — sobrescreve `voice` quando fornecida */
  voices?: string[];
  disabled?: boolean;
  immersive?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  onChapterComplete?: () => void;
}

const NARRATOR_VOICE = "pt-BR-AntonioNeural";
const FETCH_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;
const SKIP_DELAY_MS = 600; // pausa breve antes de pular frase com falha

/* ── Componente ── */
export function AudioPlayer({
  sentences,
  currentIdx,
  onSentenceChange,
  voice = NARRATOR_VOICE,
  voices,
  disabled,
  immersive = false,
  onPlayingChange,
  onChapterComplete,
}: AudioPlayerProps) {
  const [status, setStatus]             = useState<PlayerStatus>("idle");
  const [currentStyle, setCurrentStyle] = useState<VoiceStyle>("narration");
  const [rate, setRate]                 = useState(0);

  /* ── Refs estáveis ── */
  const sentencesRef         = useRef(sentences);
  const voiceRef             = useRef(voice);
  const voicesRef            = useRef(voices);
  const rateRef              = useRef(rate);
  const immersiveRef         = useRef(immersive);
  const onSentenceChangeRef  = useRef(onSentenceChange);
  const onChapterCompleteRef = useRef(onChapterComplete);
  sentencesRef.current         = sentences;
  voiceRef.current             = voice;
  voicesRef.current            = voices;
  rateRef.current              = rate;
  immersiveRef.current         = immersive;
  onSentenceChangeRef.current  = onSentenceChange;
  onChapterCompleteRef.current = onChapterComplete;

  /** Retorna a voz para o índice de frase — usa vozes por frase se disponível */
  const getVoiceForIdx = useCallback((idx: number): string => {
    return voicesRef.current?.[idx] ?? voiceRef.current;
  }, []);

  /* ── Refs de reprodução ── */
  const audioRef          = useRef<HTMLAudioElement | null>(null);
  const shouldPlayRef     = useRef(false);
  const playingIdxRef     = useRef(-1);
  const currentUrlRef     = useRef<string | null>(null);
  const prefetchUrlRef    = useRef<string | null>(null);
  const prefetchIdxRef    = useRef(-1);
  const prefetchVoiceRef  = useRef(NARRATOR_VOICE);
  const prefetchStyleRef  = useRef("narration");
  const prefetchAbortRef  = useRef<AbortController | null>(null);

  const playSentenceRef = useRef<(idx: number) => void>(() => {});

  const revokeUrl = (url: string | null) => { if (url) URL.revokeObjectURL(url); };

  useEffect(() => {
    onPlayingChange?.(status === "playing");
  }, [status, onPlayingChange]);

  /* ── Cria HTMLAudioElement apenas uma vez ── */
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

    const onError = (e: Event) => {
      const src = (e.target as HTMLAudioElement).src;
      if (!src || src === "" || src === window.location.href) return;
      // Erro durante playback — tenta avançar para próxima frase
      if (shouldPlayRef.current) {
        const next = playingIdxRef.current + 1;
        if (next < sentencesRef.current.length) {
          setTimeout(() => playSentenceRef.current(next), SKIP_DELAY_MS);
        } else {
          shouldPlayRef.current = false;
          setStatus("error");
        }
      }
    };

    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      shouldPlayRef.current = false;
      audio.pause();
      audio.removeAttribute("src");
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      revokeUrl(currentUrlRef.current);
      revokeUrl(prefetchUrlRef.current);
      prefetchAbortRef.current?.abort();
    };
  }, []);

  /* ── Busca áudio com retry automático e timeout ── */
  const fetchAudio = useCallback(async (
    text: string,
    style: string,
    v: string,
    signal?: AbortSignal,
  ): Promise<string> => {
    const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      if (attempt > 0) {
        // backoff: 500ms, 1000ms
        await new Promise((r) => setTimeout(r, 500 * attempt));
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      }

      const controller = new AbortController();
      // Estimate timeout based on text length (words) → approx audio duration
        const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
        // Rough speech speed: 2.5 words/s (150 wpm)
        const estimatedSec = wordCount / 2.5;
        const estimatedMs = Math.max(5_000, Math.ceil(estimatedSec * 1_000) + 2_000); // min 5s, +2s buffer
        const timer = setTimeout(() => controller.abort(), estimatedMs);
      // Combina o sinal externo com o timeout
      signal?.addEventListener("abort", () => controller.abort(), { once: true });

      try {
        const endpoint = ENABLE_BLOCK_AUDIO ? `${base}/api/tts/batch` : `${base}/api/tts/synthesize`;
        const payload = ENABLE_BLOCK_AUDIO
          ? { sentences: [text.trim()], voice: v, rate: rateRef.current, style }
          : { text: text.trim(), voice: v, rate: rateRef.current, style };
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!res.ok) {
          const msg = `TTS ${res.status}`;
          if (attempt < MAX_RETRIES) { console.warn(`[AudioPlayer] ${msg}, tentativa ${attempt + 1}`); continue; }
          throw new Error(msg);
        }

        const blob = await res.blob();
        if (blob.size < 512) {
          if (attempt < MAX_RETRIES) { console.warn(`[AudioPlayer] blob muito pequeno (${blob.size}B), retry ${attempt + 1}`); continue; }
          throw new Error("Áudio vazio recebido");
        }

        return URL.createObjectURL(blob);
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        if (attempt < MAX_RETRIES) {
          console.warn(`[AudioPlayer] erro na tentativa ${attempt + 1}:`, err);
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new Error("Esgotadas todas as tentativas");
  }, []);

  /* ── Para tudo ── */
  const stopAudio = useCallback(() => {
    shouldPlayRef.current = false;
    prefetchAbortRef.current?.abort();
    prefetchAbortRef.current = null;
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.removeAttribute("src"); }
    revokeUrl(currentUrlRef.current);
    revokeUrl(prefetchUrlRef.current);
    currentUrlRef.current  = null;
    prefetchUrlRef.current = null;
    prefetchIdxRef.current = -1;
    playingIdxRef.current  = -1;
    setStatus("idle");
    setCurrentStyle("narration");
  }, []);

  /* ── Pré-carrega próxima frase (sem bloquear reprodução) ── */
  const prefetchNext = useCallback(async (idx: number) => {
    const sents = sentencesRef.current;
    const v     = getVoiceForIdx(idx);
    if (idx >= sents.length || !sents[idx]?.trim()) return;
    const style = immersiveRef.current ? detectStyle(sents[idx]) : "narration";

    if (
      prefetchIdxRef.current === idx &&
      prefetchVoiceRef.current === v &&
      prefetchStyleRef.current === style &&
      prefetchUrlRef.current
    ) return;

    // Cancela prefetch anterior se ainda em andamento
    prefetchAbortRef.current?.abort();
    const abort = new AbortController();
    prefetchAbortRef.current = abort;

    prefetchIdxRef.current   = idx;
    prefetchVoiceRef.current = v;
    prefetchStyleRef.current = style;

    try {
      const url = await fetchAudio(sents[idx], style, v, abort.signal);
      if (abort.signal.aborted) { revokeUrl(url); return; }
      revokeUrl(prefetchUrlRef.current);
      prefetchUrlRef.current = url;
    } catch {
      if (!abort.signal.aborted) {
        prefetchUrlRef.current = null;
        prefetchIdxRef.current = -1;
      }
    }
  }, [fetchAudio, getVoiceForIdx]);

  /* ── Toca uma frase específica ── */
  const playSentence = useCallback(async (idx: number) => {
    const sents = sentencesRef.current;
    const v     = getVoiceForIdx(idx);

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

      // Usa pré-carregamento se disponível e válido
      if (
        prefetchIdxRef.current   === idx &&
        prefetchVoiceRef.current === v   &&
        prefetchStyleRef.current === style &&
        prefetchUrlRef.current
      ) {
        url = prefetchUrlRef.current;
        prefetchUrlRef.current = null;
        prefetchIdxRef.current = -1;
      } else {
        // Cancela qualquer prefetch em andamento para evitar requisições concorrentes
        prefetchAbortRef.current?.abort();
        prefetchAbortRef.current = null;
        url = await fetchAudio(sents[idx], style, v);
      }

      if (!shouldPlayRef.current) { revokeUrl(url); setStatus("idle"); return; }

      revokeUrl(currentUrlRef.current);
      currentUrlRef.current = url;

      const audio = audioRef.current!;

      // Limpa listeners antigos antes de setar novo src
      audio.pause();
      audio.src = url;
      audio.load();

      // Aguarda áudio estar pronto — com fallback por timeout
      if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            audio.removeEventListener("canplay", onReady);
            audio.removeEventListener("error",   onErr);
          };
          const onReady = () => { cleanup(); resolve(); };
          const onErr   = () => { cleanup(); reject(new Error("Audio load error")); };
          audio.addEventListener("canplay", onReady, { once: true });
          audio.addEventListener("error",   onErr,   { once: true });

          // Fallback: se canplay não disparar em 3s, tenta assim mesmo
          setTimeout(() => { cleanup(); resolve(); }, 3_000);
        });
      }

      if (!shouldPlayRef.current) { setStatus("idle"); return; }

      await audio.play();
      setStatus("playing");

      // Pré-carrega a próxima frase enquanto esta toca
      prefetchNext(idx + 1);

    } catch (err) {
      const name = (err as Error)?.name;
      if (name === "AbortError") { setStatus("idle"); return; }

      console.error("[AudioPlayer] erro ao reproduzir frase", idx, err);

      if (shouldPlayRef.current) {
        // Auto-skip: tenta próxima frase em vez de parar
        const next = playingIdxRef.current + 1;
        if (next < sentencesRef.current.length) {
          console.warn(`[AudioPlayer] pulando frase ${idx}, indo para ${next}`);
          setTimeout(() => {
            if (shouldPlayRef.current) playSentenceRef.current(next);
          }, SKIP_DELAY_MS);
          setStatus("loading");
        } else {
          setStatus("error");
        }
      } else {
        setStatus("idle");
      }
    }
  }, [fetchAudio, stopAudio, prefetchNext, getVoiceForIdx]);

  useEffect(() => { playSentenceRef.current = playSentence; }, [playSentence]);

  /* ── Controles públicos ── */
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
    if (audio && audio.src && audio.src !== window.location.href && status === "paused") {
      audio.play()
        .then(() => setStatus("playing"))
        .catch(() => { shouldPlayRef.current = true; playSentenceRef.current(currentIdx); });
    } else {
      playSentenceRef.current(currentIdx);
    }
  }, [currentIdx, status]);

  const skipBack = useCallback(() => {
    const newIdx = Math.max(0, currentIdx - 1);
    if (shouldPlayRef.current) playSentenceRef.current(newIdx);
    else onSentenceChangeRef.current(newIdx);
  }, [currentIdx]);

  const skipForward = useCallback(() => {
    const newIdx = Math.min(sentences.length - 1, currentIdx + 1);
    if (shouldPlayRef.current) playSentenceRef.current(newIdx);
    else onSentenceChangeRef.current(newIdx);
  }, [currentIdx, sentences.length]);

  const handleRateChange = useCallback((newRate: number) => {
    setRate(newRate);
    if (shouldPlayRef.current) stopAudio();
  }, [stopAudio]);

  const isPlaying = status === "playing";
  const isLoading = status === "loading";

  const progressPct = useMemo(
    () => ((currentIdx + 1) / Math.max(1, sentences.length)) * 100,
    [currentIdx, sentences.length],
  );

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Barra de progresso */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-muted-foreground w-16 shrink-0 tabular-nums">
          {currentIdx + 1} / {sentences.length}
        </span>
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div
            className="progress-bar-fill transition-all duration-300"
            style={{ width: `${progressPct}%` }}
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
        {/* Play/Pause/Skip */}
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

        {/* Controle de velocidade */}
        <div className="flex items-center gap-2">
          <Gauge className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Slider
            value={[rate]}
            min={-50} max={50} step={5}
            onValueChange={([v]) => handleRateChange(v)}
            className="w-24"
            data-testid="slider-rate"
          />
          <span className="text-xs text-muted-foreground w-12 font-mono tabular-nums">
            {rate > 0 ? "+" : ""}{rate}%
          </span>
        </div>
      </div>

      {status === "error" && (
        <p className="text-xs text-destructive">
          Falha no áudio — verifique sua conexão e tente novamente.
        </p>
      )}
    </div>
  );
}
