import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import debounce from "lodash/debounce";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ChevronLeft, ChevronRight, MessageSquare,
  Sparkles, X, Loader2, Settings2, Film, List,
  Repeat, Users, Zap, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { useAudioBlocks } from "@/hooks/useAudioBlock";
import {
  useGetChapter,
  useGetBook,
  useGetReadingProgress,
  useUpdateReadingProgress,
  useGetChapterSummary,
  useListChapters,
  useListCharacters,
  getGetChapterQueryKey,
  getGetBookQueryKey,
  getGetReadingProgressQueryKey,
  getGetChapterSummaryQueryKey,
  getListChaptersQueryKey,
  getListCharactersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AudioPlayer } from "@/components/audio-player";

/* ── Helpers ── */
function splitSentences(text: string): string[] {
  if (!text) return [];
  const raw = text
    .split(/(?<=[.!?…"'»])\s+(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÇÜÑ"'«\d])/)
    .flatMap((s) => s.split(/\n{2,}/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return raw.length ? raw : [text.trim()];
}

function readingTime(wordCount: number): string {
  const mins = Math.max(1, Math.round(wordCount / 200));
  return `~${mins} min`;
}

/* ── Atribuição de fala por personagem ── */

const NARRATOR_VOICE = "pt-BR-AntonioNeural";

// Verbos de atribuição de fala (pt-BR + variantes)
const ATTR_VERBS =
  /\b(disse|falou|respondeu|perguntou|gritou|murmurou|sussurrou|exclamou|ordenou|declarou|acrescentou|continuou|interrompeu|afirmou|concordou|discordou|explicou|retrucou|resmungou|implorou|lamentou|admitiu|anunciou|alertou|avisou|gemeu|soluçou|berrou|rugiu|chamou|repetiu|insistiu|comentou|observou|notou|reclamou|chorou|hesitou|cutucou|bufou|suspirou|respondeu|rebateu|prosseguiu)\b/i;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Tenta encontrar o nome de um personagem conhecido em um trecho de texto */
function findSpeakerInText(text: string, names: string[]): string | null {
  for (const name of names) {
    // Tenta o nome completo primeiro, depois cada parte com > 2 chars
    const parts = name.trim().split(/\s+/).filter((p) => p.length > 2);
    const variants = [name, ...parts];
    for (const v of variants) {
      if (new RegExp(`\\b${escapeRe(v)}\\b`, "i").test(text)) return name;
    }
  }
  return null;
}

/**
 * Para cada frase, resolve a voz que deve ser usada:
 * - Narrador: frases de narração
 * - Voz do personagem: quando a frase é diálogo atribuído a ele
 *
 * Padrões detectados (pt-BR):
 *  1. Mesma frase: "— Texto, disse Klein." → Klein fala
 *  2. Próxima frase: "— Texto.\n — Klein disse algo." → Klein fala
 *  3. Frase anterior: "Klein disse: — Texto." → Klein fala
 */
function buildSentenceVoices(
  sentences: string[],
  charVoiceMap: Record<string, string>, // nome (case-insensitive key) → voiceName
): string[] {
  const names = Object.keys(charVoiceMap);
  if (names.length === 0) return sentences.map(() => NARRATOR_VOICE);

  return sentences.map((s, i) => {
    const trimmed = s.trim();

    // Detecta se é uma frase de diálogo (começa com travessão ou aspas)
    const isDialogue =
      trimmed.startsWith("—") ||
      trimmed.startsWith("–") ||
      trimmed.startsWith('"') ||
      trimmed.startsWith("\u201C"); // "

    if (!isDialogue) return NARRATOR_VOICE;

    // 1. Atribuição inline na mesma frase: "— Texto, disse Klein."
    if (ATTR_VERBS.test(s)) {
      const speaker = findSpeakerInText(s, names);
      if (speaker) return charVoiceMap[speaker] ?? NARRATOR_VOICE;
    }

    // 2. Atribuição na frase seguinte: "— Texto.\n — Klein disse."
    const next = sentences[i + 1] ?? "";
    if (next && ATTR_VERBS.test(next)) {
      const speaker = findSpeakerInText(next, names);
      if (speaker) return charVoiceMap[speaker] ?? NARRATOR_VOICE;
    }

    // 3. Atribuição na frase anterior: "Klein disse: — Texto."
    const prev = sentences[i - 1] ?? "";
    if (prev && ATTR_VERBS.test(prev)) {
      const speaker = findSpeakerInText(prev, names);
      if (speaker) return charVoiceMap[speaker] ?? NARRATOR_VOICE;
    }

    return NARRATOR_VOICE;
  });
}

/* ── LocalStorage hook ── */
function useLocalStorage<T>(key: string, init: T): [T, (v: T) => void] {
  const [value, setRaw] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      return s !== null ? (JSON.parse(s) as T) : init;
    } catch { return init; }
  });
  const set = useCallback((newVal: T) => {
    setRaw(newVal);
    try { localStorage.setItem(key, JSON.stringify(newVal)); } catch {}
  }, [key]);
  return [value, set];
}

/* ── Tipos de tema ── */
type ReaderTheme = "dark" | "sepia" | "light";
type ReaderFont  = "serif" | "sans";

const THEME_BG: Record<ReaderTheme, string> = {
  dark:  "bg-[#0f1117]",
  sepia: "bg-[#f5ead0]",
  light: "bg-white",
};

const THEME_CLASS: Record<ReaderTheme, string> = {
  dark:  "",
  sepia: "reader-sepia",
  light: "reader-light",
};

/* ── Painel de Resumo ── */
function SummaryPanel({ bookId, chapterNumber, onClose }: {
  bookId: number; chapterNumber: number; onClose: () => void;
}) {
  const { data: summary, isLoading } = useGetChapterSummary(bookId, chapterNumber, {
    query: { queryKey: getGetChapterSummaryQueryKey(bookId, chapterNumber) },
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: 340 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 340 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed top-0 right-0 h-full w-80 bg-card border-l border-border shadow-2xl z-40 flex flex-col"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Resumo IA</span>
          <Badge variant="secondary" className="text-[10px]">Cap.{chapterNumber}</Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-4">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Gerando resumo…</span>
            </div>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className={`h-3 ${i % 3 === 0 ? "w-3/4" : "w-full"}`} />
            ))}
          </div>
        ) : summary ? (
          <>
            {summary.quickSummary && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-primary uppercase tracking-wide mb-1.5">
                  ⚡ Resumo Rápido
                </p>
                <p className="text-sm leading-relaxed text-foreground">{summary.quickSummary}</p>
              </div>
            )}

            {summary.charactersPresent && summary.charactersPresent.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="w-3 h-3 text-blue-400" />
                  <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">
                    Personagens neste capítulo
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {summary.charactersPresent.map((name) => (
                    <span key={name} className="text-xs bg-blue-950/60 text-blue-300 border border-blue-800/50 px-2 py-0.5 rounded-full">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {summary.keyEvents && summary.keyEvents.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Eventos Principais
                </p>
                <ul className="space-y-2">
                  {summary.keyEvents.map((event, i) => (
                    <li key={i} className="flex gap-2 text-xs text-foreground/90">
                      <span className="text-primary mt-0.5 shrink-0">▸</span>
                      <span>{event}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.revelations && summary.revelations.length > 0 && (
              <div className="bg-yellow-950/30 border border-yellow-800/30 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Eye className="w-3 h-3 text-yellow-400" />
                  <p className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wide">Revelações</p>
                </div>
                <ul className="space-y-1.5">
                  {summary.revelations.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs text-yellow-200/80">
                      <span className="text-yellow-500 mt-0.5 shrink-0">!</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {summary.powerChanges && summary.powerChanges.length > 0 && (
              <div className="bg-blue-950/30 border border-blue-800/30 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-3 h-3 text-blue-400" />
                  <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Mudanças de Poder</p>
                </div>
                <ul className="space-y-1.5">
                  {summary.powerChanges.map((p, i) => (
                    <li key={i} className="flex gap-2 text-xs text-blue-200/80">
                      <span className="text-blue-400 mt-0.5 shrink-0">↑</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Resumo Completo
              </p>
              <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line" data-testid="text-summary">
                {summary.summary}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Não foi possível gerar o resumo.</p>
        )}
      </div>
    </motion.div>
  );
}

/* ── Painel de Índice (TOC) ── */
function TocPanel({ chapters, currentChapter, onClose, onNavigate }: {
  chapters: Array<{ id: number; chapterNumber: number; title?: string | null; wordCount: number }>;
  currentChapter: number;
  onClose: () => void;
  onNavigate: (num: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-ch="${currentChapter}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [currentChapter]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -320 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -320 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed top-0 left-0 h-full w-72 bg-card border-r border-border shadow-2xl z-40 flex flex-col"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <List className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Capítulos</span>
          <Badge variant="secondary" className="text-xs ml-1">{chapters.length}</Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {chapters.map((ch) => {
          const isActive = ch.chapterNumber === currentChapter;
          const isRead   = ch.chapterNumber < currentChapter;
          return (
            <button
              key={ch.id}
              data-ch={ch.chapterNumber}
              onClick={() => { onNavigate(ch.chapterNumber); onClose(); }}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-secondary/60 transition-colors border-b border-border/20 last:border-0 ${
                isActive ? "bg-primary/10 border-l-2 border-l-primary" : ""
              }`}
            >
              <span className={`text-xs font-mono mt-0.5 w-6 shrink-0 ${isActive ? "text-primary font-bold" : "text-muted-foreground"}`}>
                {String(ch.chapterNumber).padStart(2, "0")}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${isActive ? "text-primary font-medium" : isRead ? "text-muted-foreground" : "text-foreground"}`}>
                  {ch.title ?? `Capítulo ${ch.chapterNumber}`}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">
                  {readingTime(ch.wordCount)}
                  {isRead && !isActive && <span className="text-green-500 ml-2">✓</span>}
                  {isActive && <span className="text-primary ml-2">● atual</span>}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

/* ── Configurações de leitura ── */
function ReaderSettings({
  fontSize, onFontSize,
  lineHeight, onLineHeight,
  theme, onTheme,
  font, onFont,
}: {
  fontSize: number;   onFontSize:   (n: number) => void;
  lineHeight: number; onLineHeight: (n: number) => void;
  theme: ReaderTheme; onTheme:      (t: ReaderTheme) => void;
  font: ReaderFont;   onFont:       (f: ReaderFont)  => void;
}) {
  return (
    <div className="space-y-4 w-64 p-1">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tamanho da fonte</p>
        <div className="flex items-center gap-3">
          <span className="text-xs font-serif">A</span>
          <Slider value={[fontSize]} min={14} max={26} step={1} onValueChange={([v]) => onFontSize(v)} className="flex-1" />
          <span className="text-lg font-serif">A</span>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Espaçamento</p>
        <div className="flex items-center gap-3">
          <Slider value={[lineHeight]} min={1.4} max={2.4} step={0.1} onValueChange={([v]) => onLineHeight(v)} className="flex-1" />
          <span className="text-xs text-muted-foreground w-8">{lineHeight.toFixed(1)}</span>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fonte</p>
        <div className="flex gap-2">
          {(["serif", "sans"] as ReaderFont[]).map((f) => (
            <button
              key={f}
              onClick={() => onFont(f)}
              className={`flex-1 py-1.5 rounded text-sm border transition-colors ${
                font === f ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "serif" ? <span className="font-serif">Serif</span> : <span className="font-sans">Sans</span>}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fundo</p>
        <div className="flex gap-2">
          {([
            { key: "dark"  as const, label: "Escuro", bg: "bg-[#0f1117]", text: "text-white"     },
            { key: "sepia" as const, label: "Sépia",  bg: "bg-[#f5ead0]", text: "text-amber-900" },
            { key: "light" as const, label: "Claro",  bg: "bg-white",     text: "text-gray-900"  },
          ]).map(({ key, label, bg, text }) => (
            <button
              key={key}
              onClick={() => onTheme(key)}
              className={`flex-1 py-1.5 rounded text-xs border transition-all ${bg} ${text} ${
                theme === key ? "border-primary ring-1 ring-primary" : "border-border"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Página do Leitor ── */
export default function ReaderPage({ params }: { params: { id: string; num: string } }) {
  const bookId        = parseInt(params.id,  10);
  const chapterNumber = parseInt(params.num, 10);
  const [, setLocation] = useLocation();
  const queryClient     = useQueryClient();

  // Configurações persistidas
  const [fontSize,   setFontSize  ] = useLocalStorage("reader-font-size",   18);
  const [lineHeight, setLineHeight] = useLocalStorage("reader-line-height",  1.9);
  const [theme,      setTheme     ] = useLocalStorage<ReaderTheme>("reader-theme", "dark");
  const [font,       setFont      ] = useLocalStorage<ReaderFont>("reader-font",   "serif");
  const [autoplay,   setAutoplay  ] = useLocalStorage("reader-autoplay", false);

  // Estado de UI
  const [showSummary,   setShowSummary  ] = useState(false);
  const [showToc,       setShowToc      ] = useState(false);
  const [showControls,  setShowControls ] = useState(true);
  const [cinematic,     setCinematic    ] = useState(false);
  const [isPlaying,     setIsPlaying    ] = useState(false);

  const [currentSentence, setCurrentSentence] = useState(0);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dados
  const { data: book } = useGetBook(bookId, {
    query: { enabled: !!bookId, queryKey: getGetBookQueryKey(bookId) },
  });
  const { data: chapter, isLoading: chapterLoading } = useGetChapter(bookId, chapterNumber, {
    query: { enabled: !!bookId && !!chapterNumber, queryKey: getGetChapterQueryKey(bookId, chapterNumber) },
  });
  const { data: progress } = useGetReadingProgress(bookId, {
    query: { enabled: !!bookId, queryKey: getGetReadingProgressQueryKey(bookId) },
  });
  const { data: allChapters } = useListChapters(bookId, {
    query: { enabled: !!bookId && showToc, queryKey: getListChaptersQueryKey(bookId) },
  });
  const { data: characters } = useListCharacters(bookId, {
    query: { enabled: !!bookId, queryKey: getListCharactersQueryKey(bookId) },
  });
  const updateProgress = useUpdateReadingProgress();



// Compute audio blocks (≈ 300 words each) and use them as the sentence source
const { blocks } = useAudioBlocks(chapter?.content ?? "", 300);
const sentences = blocks.map(b => b.text);
  const totalChapters = book?.totalChapters ?? 0;

  /**
   * Mapa nome→voz para personagens com voz atribuída.
   * Usa o nome original como chave (case-insensitive via findSpeakerInText).
   */
  const charVoiceMap = useMemo<Record<string, string>>(() => {
    if (!characters?.length) return {};
    return Object.fromEntries(
      characters
        .filter((c) => c.assignedVoice && c.name)
        .map((c) => [c.name, c.assignedVoice as string]),
    );
  }, [characters]);

  /** Voz resolvida para cada frase do capítulo */
  const sentenceVoices = useMemo(
    () => buildSentenceVoices(sentences, charVoiceMap),
    [sentences, charVoiceMap],
  );

  void progress;

  // Reset ao trocar de capítulo
  useEffect(() => { setCurrentSentence(0); }, [chapterNumber]);

  // Salva progresso ao visitar (debounced)
  const debouncedSaveProgress = useMemo(() => {
    // 500 ms debounce – reduz chamadas DB ao mudar rapidamente de capítulos
    const fn = debounce((bkId: number, chNum: number) => {
      updateProgress.mutate(
        { id: bkId, data: { currentChapter: chNum, characterPosition: 0 } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetReadingProgressQueryKey(bkId) }) }
      );
    }, 500);
    return fn;
  }, [updateProgress, queryClient]);

  useEffect(() => {
    if (!bookId || !chapterNumber) return;
    debouncedSaveProgress(bookId, chapterNumber);
    // cleanup on unmount
    return () => debouncedSaveProgress.cancel();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterNumber, bookId]);

  // Auto-ocultar controles após inatividade
  const showControlsTemp = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  // Scroll da frase ativa para o centro da tela
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    sentenceRefs.current[currentSentence]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentSentence]);

  const goTo = useCallback((num: number) => setLocation(`/read/${bookId}/chapter/${num}`), [bookId, setLocation]);

  const handleChapterComplete = useCallback(() => {
    if (autoplay && chapterNumber < totalChapters) goTo(chapterNumber + 1);
  }, [autoplay, chapterNumber, totalChapters, goTo]);

  // Atalhos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        document.querySelector<HTMLElement>('[data-testid="btn-pause"], [data-testid="btn-play"]')?.click();
        return;
      }
      if (e.shiftKey && e.key === "ArrowRight") { e.preventDefault(); if (chapterNumber < totalChapters) goTo(chapterNumber + 1); return; }
      if (e.shiftKey && e.key === "ArrowLeft")  { e.preventDefault(); if (chapterNumber > 1) goTo(chapterNumber - 1); return; }
      if (e.key === "ArrowRight") { e.preventDefault(); document.querySelector<HTMLElement>('[data-testid="btn-skip-forward"]')?.click(); return; }
      if (e.key === "ArrowLeft")  { e.preventDefault(); document.querySelector<HTMLElement>('[data-testid="btn-skip-back"]')?.click(); return; }
      if (e.key === "Escape") { setShowSummary(false); setShowToc(false); return; }
      if (e.key === "c" || e.key === "C") { setCinematic((v) => !v); return; }
      if (e.key === "t" || e.key === "T") { setShowToc((v) => !v); return; }
      if (e.key === "a" || e.key === "A") { setAutoplay(!autoplay); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [chapterNumber, totalChapters, goTo, autoplay, setAutoplay]);

  const bgClass    = THEME_BG[theme];
  const themeClass = THEME_CLASS[theme];
  const fontClass  = font === "serif" ? "font-serif" : "font-sans";
  const dimInactive = cinematic && isPlaying;

  return (
    <div
      className={`min-h-screen ${bgClass} ${themeClass} relative transition-colors duration-300`}
      onMouseMove={showControlsTemp}
      onTouchStart={showControlsTemp}
    >
      {/* Vinheta cinemática */}
      {dimInactive && (
        <div
          className="pointer-events-none fixed inset-0 z-10"
          style={{ background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)" }}
        />
      )}

      {/* Barra superior */}
      <AnimatePresence>
        {showControls && (
          <motion.header
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.18 }}
            className="fixed top-0 left-0 right-0 z-30 border-b border-border/50"
            style={{ background: "rgba(15,17,23,0.92)", backdropFilter: "blur(12px)" }}
          >
            <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
                <Link href={`/book/${bookId}`} data-testid="btn-back"><ArrowLeft className="w-4 h-4" /></Link>
              </Button>

              <div className="flex-1 min-w-0 text-center">
                <p className="text-xs text-muted-foreground truncate">{book?.title}</p>
                <p className="text-sm font-medium text-foreground truncate">
                  {chapter?.title ?? `Capítulo ${chapterNumber}`}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost" size="icon"
                  className={`h-8 w-8 ${showToc ? "text-primary bg-primary/10" : ""}`}
                  onClick={() => setShowToc((v) => !v)}
                  title="Índice (T)"
                  data-testid="btn-toc"
                >
                  <List className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className={`h-8 w-8 ${cinematic ? "text-primary bg-primary/10" : ""}`}
                  onClick={() => setCinematic((v) => !v)}
                  title="Modo Cinemático (C)"
                  data-testid="btn-cinematic"
                >
                  <Film className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  className={`h-8 w-8 ${autoplay ? "text-primary bg-primary/10" : ""}`}
                  onClick={() => setAutoplay(!autoplay)}
                  title={autoplay ? "Autoplay ativado (A)" : "Autoplay desativado (A)"}
                  data-testid="btn-autoplay"
                >
                  <Repeat className="w-4 h-4" />
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="Configurações" data-testid="btn-settings">
                      <Settings2 className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto p-3">
                    <ReaderSettings
                      fontSize={fontSize}   onFontSize={setFontSize}
                      lineHeight={lineHeight} onLineHeight={setLineHeight}
                      theme={theme}         onTheme={setTheme}
                      font={font}           onFont={setFont}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  variant="ghost" size="icon"
                  className={`h-8 w-8 ${showSummary ? "text-primary bg-primary/10" : ""}`}
                  onClick={() => setShowSummary((v) => !v)}
                  title="Resumo IA"
                  data-testid="btn-summary"
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <Link href={`/book/${bookId}/ask`}>
                    <MessageSquare className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>
            <div className="max-w-3xl mx-auto px-4 pb-2">
              <p className="text-[10px] text-muted-foreground/50 text-center">
                Espaço: play/pause · ←/→: frase · Shift+←/→: capítulo · T: índice · C: cinemático · A: autoplay · Esc: fechar
              </p>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Navegação lateral */}
      <AnimatePresence>
        {showControls && chapterNumber > 1 && (
          <motion.button
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
            onClick={() => goTo(chapterNumber - 1)}
            className="fixed left-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-card/80 border border-border backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-all"
            title="Capítulo anterior (Shift+←)"
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showControls && chapterNumber < totalChapters && (
          <motion.button
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
            onClick={() => goTo(chapterNumber + 1)}
            className="fixed right-3 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-card/80 border border-border backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-card transition-all"
            title="Próximo capítulo (Shift+→)"
          >
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Conteúdo */}
      <div className="max-w-3xl mx-auto px-6 pt-28 pb-48">
        <div className="text-center mb-8">
          <span className="text-xs font-mono text-muted-foreground bg-secondary px-3 py-1 rounded-full">
            {chapterNumber} / {totalChapters}
          </span>
        </div>

        {chapterLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className={`h-4 ${i % 5 === 4 ? "w-2/3" : "w-full"}`} />
            ))}
          </div>
        ) : chapter ? (
          <>
            <h1 className={`text-2xl font-bold text-foreground mb-2 text-center ${fontClass}`}>
              {chapter.title ?? `Capítulo ${chapterNumber}`}
            </h1>
            <p className="text-center text-xs text-muted-foreground mb-10">
              {chapter.wordCount.toLocaleString("pt-BR")} palavras · {readingTime(chapter.wordCount)}
            </p>
            <div className={`leading-relaxed ${fontClass}`} style={{ fontSize: `${fontSize}px`, lineHeight }}>
              {sentences.map((sentence, idx) => {
                const isActive = idx === currentSentence;
                const isPast   = idx < currentSentence;
                return (
                  <span
                    key={idx}
                    ref={(el) => { sentenceRefs.current[idx] = el; }}
                    onClick={() => setCurrentSentence(idx)}
                    className={`cursor-pointer transition-all duration-200 ${
                      isActive  ? "text-foreground bg-primary/15 rounded px-0.5"
                      : isPast  ? (dimInactive ? "opacity-20 text-muted-foreground" : "text-muted-foreground")
                      : dimInactive ? "opacity-30" : "text-foreground/90"
                    } hover:text-foreground`}
                  >
                    {sentence}{" "}
                  </span>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-center text-muted-foreground">Capítulo não encontrado.</p>
        )}
      </div>

      {/* Player de áudio — simplificado, sem seleção de voz */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/50 px-4 py-4"
            style={{ background: "rgba(15,17,23,0.96)", backdropFilter: "blur(12px)" }}
          >
            <div className="max-w-3xl mx-auto">
              <AudioPlayer
                sentences={sentences}
                voices={sentenceVoices}
                currentIdx={currentSentence}
                onSentenceChange={setCurrentSentence}
                disabled={chapterLoading || !chapter}
                immersive={cinematic}
                onPlayingChange={setIsPlaying}
                onChapterComplete={handleChapterComplete}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Painel de Resumo */}
      <AnimatePresence>
        {showSummary && (
          <SummaryPanel bookId={bookId} chapterNumber={chapterNumber} onClose={() => setShowSummary(false)} />
        )}
      </AnimatePresence>

      {/* Painel de Índice */}
      <AnimatePresence>
        {showToc && allChapters && (
          <TocPanel
            chapters={allChapters}
            currentChapter={chapterNumber}
            onClose={() => setShowToc(false)}
            onNavigate={goTo}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
