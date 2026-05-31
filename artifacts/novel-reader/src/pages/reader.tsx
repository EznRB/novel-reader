import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ChevronLeft, ChevronRight, MessageSquare,
  Sparkles, X, Loader2, Settings2, Film,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useGetChapter,
  useGetBook,
  useGetReadingProgress,
  useUpdateReadingProgress,
  useGetChapterSummary,
  getGetChapterQueryKey,
  getGetBookQueryKey,
  getGetReadingProgressQueryKey,
  getGetChapterSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AudioPlayer, type Voice } from "@/components/audio-player";

/* ── Sentence splitter ── */
function splitSentences(text: string): string[] {
  if (!text) return [];
  const raw = text
    .split(/(?<=[.!?…"'»])\s+(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÇÜÑ"'«\d])/)
    .flatMap((s) => s.split(/\n{2,}/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return raw.length ? raw : [text.trim()];
}

/* ── Reader Theme types ── */
type ReaderTheme = "dark" | "sepia" | "light";
type ReaderFont = "serif" | "sans";

const THEME_CLASSES: Record<ReaderTheme, string> = {
  dark: "",
  sepia: "reader-sepia",
  light: "reader-light",
};

const THEME_BG: Record<ReaderTheme, string> = {
  dark: "bg-[#0f1117]",
  sepia: "bg-[#f5ead0]",
  light: "bg-white",
};

/* ── Summary panel ── */
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
          <span className="font-semibold text-sm">AI Summary</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-4">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /><span>Generating summary…</span>
            </div>
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className={`h-3 ${i % 3 === 0 ? "w-3/4" : "w-full"}`} />)}
          </div>
        ) : summary ? (
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-line" data-testid="text-summary">
            {summary.summary}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Could not generate summary.</p>
        )}
      </div>
    </motion.div>
  );
}

/* ── Reading settings popover ── */
function ReaderSettings({
  fontSize, onFontSize, lineHeight, onLineHeight,
  theme, onTheme, font, onFont,
}: {
  fontSize: number; onFontSize: (n: number) => void;
  lineHeight: number; onLineHeight: (n: number) => void;
  theme: ReaderTheme; onTheme: (t: ReaderTheme) => void;
  font: ReaderFont; onFont: (f: ReaderFont) => void;
}) {
  return (
    <div className="space-y-4 w-64 p-1">
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Font size</p>
        <div className="flex items-center gap-3">
          <span className="text-xs font-serif">A</span>
          <Slider value={[fontSize]} min={14} max={26} step={1} onValueChange={([v]) => onFontSize(v)} className="flex-1" />
          <span className="text-lg font-serif">A</span>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Line spacing</p>
        <div className="flex items-center gap-3">
          <Slider value={[lineHeight]} min={1.4} max={2.4} step={0.1} onValueChange={([v]) => onLineHeight(v)} className="flex-1" />
          <span className="text-xs text-muted-foreground w-8">{lineHeight.toFixed(1)}</span>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Font</p>
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
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Background</p>
        <div className="flex gap-2">
          {([
            { key: "dark",  label: "Dark",  bg: "bg-[#0f1117]", text: "text-white"      },
            { key: "sepia", label: "Sepia", bg: "bg-[#f5ead0]", text: "text-amber-900"  },
            { key: "light", label: "Light", bg: "bg-white",     text: "text-gray-900"   },
          ] as const).map(({ key, label, bg, text }) => (
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

/* ── Voice fetch hook ── */
function useVoices() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
    fetch(`${base}/api/tts/voices`)
      .then((r) => r.json())
      .then((data: Voice[]) => setVoices(data))
      .catch(() => setVoices([]))
      .finally(() => setLoading(false));
  }, []);
  return { voices, loading };
}

/* ── Main reader ── */
export default function ReaderPage({ params }: { params: { id: string; num: string } }) {
  const bookId = parseInt(params.id, 10);
  const chapterNumber = parseInt(params.num, 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Reader settings
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.9);
  const [theme, setTheme] = useState<ReaderTheme>("dark");
  const [font, setFont] = useState<ReaderFont>("serif");
  const [showSummary, setShowSummary] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [cinematicMode, setCinematicMode] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // TTS state
  const [currentSentence, setCurrentSentence] = useState(0);
  const [voice, setVoice] = useState("en-US-AriaNeural");
  const [rate, setRate] = useState(0);
  const { voices, loading: voicesLoading } = useVoices();

  const { data: book } = useGetBook(bookId, {
    query: { enabled: !!bookId, queryKey: getGetBookQueryKey(bookId) },
  });
  const { data: chapter, isLoading: chapterLoading } = useGetChapter(bookId, chapterNumber, {
    query: { enabled: !!bookId && !!chapterNumber, queryKey: getGetChapterQueryKey(bookId, chapterNumber) },
  });
  const { data: progress } = useGetReadingProgress(bookId, {
    query: { enabled: !!bookId, queryKey: getGetReadingProgressQueryKey(bookId) },
  });
  const updateProgress = useUpdateReadingProgress();

  // useMemo keeps the array reference stable across re-renders so the AudioPlayer
  // does not see a new prop on every render (which was the root cause of the
  // "stuck on loading" bug — new reference → useCallback deps change → Audio
  // element recreated → shouldPlayRef reset to false mid-fetch).
  const sentences = useMemo(
    () => (chapter?.content ? splitSentences(chapter.content) : []),
    [chapter?.content],
  );
  const totalChapters = book?.totalChapters ?? 0;

  // Reset sentence index on chapter change
  useEffect(() => {
    setCurrentSentence(0);
  }, [chapterNumber]);

  // Save progress on chapter visit
  useEffect(() => {
    if (bookId && chapterNumber) {
      updateProgress.mutate(
        { id: bookId, data: { currentChapter: chapterNumber, characterPosition: 0 } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetReadingProgressQueryKey(bookId) }) }
      );
    }
  }, [chapterNumber, bookId]);

  // Auto-hide controls
  const showControlsTemp = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  // Sentence ref for scroll
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    const el = sentenceRefs.current[currentSentence];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentSentence]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        const btn = document.querySelector<HTMLElement>(
          '[data-testid="btn-pause"], [data-testid="btn-play"]'
        );
        btn?.click();
        return;
      }

      if (e.key === "ArrowRight" && e.shiftKey) {
        e.preventDefault();
        if (chapterNumber < totalChapters) setLocation(`/read/${bookId}/chapter/${chapterNumber + 1}`);
        return;
      }
      if (e.key === "ArrowLeft" && e.shiftKey) {
        e.preventDefault();
        if (chapterNumber > 1) setLocation(`/read/${bookId}/chapter/${chapterNumber - 1}`);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const btn = document.querySelector<HTMLElement>('[data-testid="btn-skip-forward"]');
        btn?.click();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const btn = document.querySelector<HTMLElement>('[data-testid="btn-skip-back"]');
        btn?.click();
        return;
      }
      if (e.key === "Escape") {
        setShowSummary(false);
        return;
      }
      if (e.key === "c" || e.key === "C") {
        setCinematicMode((v) => !v);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [chapterNumber, totalChapters, bookId, setLocation]);

  const goTo = (num: number) => setLocation(`/read/${bookId}/chapter/${num}`);

  const bgClass = THEME_BG[theme];
  const themeClass = THEME_CLASSES[theme];
  const fontClass = font === "serif" ? "font-serif" : "font-sans";

  // Cinematic dim: only dim when cinematic + audio playing
  const dimInactive = cinematicMode && isAudioPlaying;

  return (
    <div
      className={`min-h-screen ${bgClass} ${themeClass} relative transition-colors duration-300`}
      onMouseMove={showControlsTemp}
      onTouchStart={showControlsTemp}
    >
      {/* Cinematic vignette overlay */}
      {dimInactive && (
        <div
          className="pointer-events-none fixed inset-0 z-10"
          style={{
            background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      )}

      {/* Top bar */}
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
                <Link href={`/book/${bookId}`} data-testid="btn-back">
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </Button>

              <div className="flex-1 min-w-0 text-center">
                <p className="text-xs text-muted-foreground truncate">{book?.title}</p>
                <p className="text-sm font-medium text-foreground truncate">
                  {chapter?.title ?? `Chapter ${chapterNumber}`}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {/* Cinematic mode toggle */}
                <Button
                  variant="ghost" size="icon" className={`h-8 w-8 ${cinematicMode ? "text-primary bg-primary/10" : ""}`}
                  onClick={() => setCinematicMode((v) => !v)}
                  title="Cinematic mode (C)"
                  data-testid="btn-cinematic"
                >
                  <Film className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8"
                  onClick={() => setShowSummary((v) => !v)}
                  data-testid="btn-summary"
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                  <Link href={`/book/${bookId}/ask`} data-testid="btn-ask">
                    <MessageSquare className="w-4 h-4" />
                  </Link>
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="btn-settings">
                      <Settings2 className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto" align="end">
                    <ReaderSettings
                      fontSize={fontSize} onFontSize={setFontSize}
                      lineHeight={lineHeight} onLineHeight={setLineHeight}
                      theme={theme} onTheme={setTheme}
                      font={font} onFont={setFont}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Keyboard hint */}
            {cinematicMode && (
              <div className="text-center pb-1">
                <span className="text-[10px] text-muted-foreground/60 font-mono">
                  Space: play/pause · ← →: sentence · Shift+← →: chapter · C: cinematic · Esc: close
                </span>
              </div>
            )}
          </motion.header>
        )}
      </AnimatePresence>

      {/* Chapter navigation arrows */}
      <AnimatePresence>
        {showControls && (
          <>
            {chapterNumber > 1 && (
              <motion.button
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => goTo(chapterNumber - 1)}
                className="fixed left-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-card/80 border border-border backdrop-blur-sm hover:bg-card hover:border-primary/50 transition-all"
                data-testid="btn-prev-chapter"
              >
                <ChevronLeft className="w-5 h-5 text-foreground" />
              </motion.button>
            )}
            {chapterNumber < totalChapters && (
              <motion.button
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => goTo(chapterNumber + 1)}
                className="fixed right-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-card/80 border border-border backdrop-blur-sm hover:bg-card hover:border-primary/50 transition-all"
                data-testid="btn-next-chapter"
              >
                <ChevronRight className="w-5 h-5 text-foreground" />
              </motion.button>
            )}
          </>
        )}
      </AnimatePresence>

      {/* Reading content */}
      <div className="pt-20 pb-56 px-4">
        <div className="max-w-2xl mx-auto">
          {/* Chapter header */}
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3 text-xs font-mono border-border/60">
              {chapterNumber} / {totalChapters}
            </Badge>
            <h1
              className={`font-serif text-2xl font-semibold mb-1 ${
                theme === "dark" ? "text-white/90" : theme === "sepia" ? "text-amber-950" : "text-gray-900"
              }`}
            >
              {chapter?.title ?? `Chapter ${chapterNumber}`}
            </h1>
            {chapter && (
              <p className="text-xs text-muted-foreground font-mono">{chapter.wordCount.toLocaleString()} words</p>
            )}
          </div>

          {/* Text */}
          {chapterLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className={`h-4 ${i % 5 === 4 ? "w-2/3" : "w-full"} bg-white/5`} />
              ))}
            </div>
          ) : chapter ? (
            <div
              className={`prose-reader ${fontClass}`}
              style={{
                fontSize: `${fontSize}px`,
                lineHeight,
                color: theme === "dark" ? "hsl(215 15% 85%)" : theme === "sepia" ? "#3d2b1f" : "#111827",
              }}
            >
              {sentences.map((sentence, idx) => {
                const isActive = idx === currentSentence;
                return (
                  <span
                    key={idx}
                    ref={(el) => { sentenceRefs.current[idx] = el; }}
                    data-testid={`sentence-${idx}`}
                    className={`transition-all duration-300 ${
                      isActive
                        ? "sentence-active"
                        : dimInactive
                          ? "opacity-25"
                          : ""
                    }`}
                    style={{
                      cursor: "pointer",
                      ...(isActive && cinematicMode ? {
                        textShadow: "0 0 20px rgba(var(--primary), 0.4)",
                      } : {}),
                    }}
                    onClick={() => setCurrentSentence(idx)}
                  >
                    {sentence}{" "}
                  </span>
                );
              })}
            </div>
          ) : null}

          {/* Chapter nav (bottom) */}
          {!chapterLoading && chapter && (
            <div className="flex items-center justify-between mt-12 pt-8 border-t border-border/30">
              <Button
                variant="outline"
                onClick={() => goTo(chapterNumber - 1)}
                disabled={chapterNumber <= 1}
                className="gap-2"
                data-testid="btn-prev-chapter-bottom"
              >
                <ChevronLeft className="w-4 h-4" /> Previous
              </Button>
              <Button
                variant="outline"
                onClick={() => goTo(chapterNumber + 1)}
                disabled={chapterNumber >= totalChapters}
                className="gap-2"
                data-testid="btn-next-chapter-bottom"
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Audio Player Bar */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/50 px-4 py-3"
        style={{ background: "rgba(15,17,23,0.95)", backdropFilter: "blur(16px)" }}
      >
        <div className="max-w-3xl mx-auto">
          <AudioPlayer
            sentences={sentences}
            currentIdx={currentSentence}
            onSentenceChange={setCurrentSentence}
            voice={voice}
            rate={rate}
            onVoiceChange={setVoice}
            onRateChange={setRate}
            voices={voices}
            voicesLoading={voicesLoading}
            disabled={chapterLoading || !chapter}
            immersive={cinematicMode}
            onPlayingChange={setIsAudioPlaying}
          />
        </div>
      </div>

      {/* Summary panel */}
      <AnimatePresence>
        {showSummary && (
          <SummaryPanel
            bookId={bookId}
            chapterNumber={chapterNumber}
            onClose={() => setShowSummary(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
