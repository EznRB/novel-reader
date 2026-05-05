import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Play, Pause, Square, ChevronLeft, ChevronRight,
  MessageSquare, BookOpen, FileText, Sparkles, Settings2,
  Volume2, Loader2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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

/* ── TTS Hook ── */
function useTTS(text: string, speed: number, voiceURI: string | null) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [wordIndex, setWordIndex] = useState(-1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const wordsRef = useRef<string[]>([]);

  useEffect(() => {
    wordsRef.current = text.split(/\s+/).filter(Boolean);
  }, [text]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setWordIndex(-1);
  }, []);

  const play = useCallback(() => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speed;

    if (voiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find((v) => v.voiceURI === voiceURI);
      if (v) utterance.voice = v;
    }

    let wordCount = 0;
    utterance.onboundary = (e) => {
      if (e.name === "word") {
        setWordIndex(wordCount);
        wordCount++;
      }
    };
    utterance.onend = () => {
      setIsPlaying(false);
      setWordIndex(-1);
    };
    utterance.onerror = () => {
      setIsPlaying(false);
      setWordIndex(-1);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
  }, [text, speed, voiceURI]);

  const pause = useCallback(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setIsPlaying(false);
    }
  }, []);

  const resume = useCallback(() => {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsPlaying(true);
    } else {
      play();
    }
  }, [play]);

  useEffect(() => () => { window.speechSynthesis.cancel(); }, []);

  return { isPlaying, wordIndex, play, pause, resume, stop };
}

/* ── Chapter Text Component ── */
function ChapterText({ content, wordIndex }: { content: string; wordIndex: number }) {
  const words = content.split(/(\s+)/);
  const wordElements = useRef<(HTMLSpanElement | null)[]>([]);
  let realWordIdx = 0;

  useEffect(() => {
    if (wordIndex >= 0 && wordElements.current[wordIndex]) {
      wordElements.current[wordIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [wordIndex]);

  return (
    <div className="prose-reading max-w-2xl mx-auto">
      {words.map((token, i) => {
        if (/^\s+$/.test(token)) return <span key={i}>{token}</span>;
        const idx = realWordIdx++;
        const isActive = idx === wordIndex;
        return (
          <span
            key={i}
            ref={(el) => { wordElements.current[idx] = el; }}
            className={`transition-all duration-100 ${isActive ? "tts-word-current" : ""}`}
          >
            {token}
          </span>
        );
      })}
    </div>
  );
}

/* ── Voice Selector ── */
function VoiceSelector({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  if (voices.length === 0) return null;

  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs w-44" data-testid="select-voice">
        <SelectValue placeholder="Select voice" />
      </SelectTrigger>
      <SelectContent>
        {voices.map((v) => (
          <SelectItem key={v.voiceURI} value={v.voiceURI} className="text-xs">
            {v.name} ({v.lang})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ── Summary Panel ── */
function SummaryPanel({ bookId, chapterNumber, onClose }: {
  bookId: number;
  chapterNumber: number;
  onClose: () => void;
}) {
  const { data: summary, isLoading } = useGetChapterSummary(bookId, chapterNumber, {
    query: { queryKey: getGetChapterSummaryQueryKey(bookId, chapterNumber) },
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: 320 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 320 }}
      className="fixed top-0 right-0 h-full w-80 bg-card border-l border-card-border shadow-xl z-30 flex flex-col"
    >
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-serif font-semibold text-sm">Chapter Summary</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="btn-close-summary">
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Generating summary...</span>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
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

/* ── Main Reader Page ── */
export default function ReaderPage({ params }: { params: { id: string; num: string } }) {
  const bookId = parseInt(params.id, 10);
  const chapterNumber = parseInt(params.num, 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [speed, setSpeed] = useState(1);
  const [voiceURI, setVoiceURI] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [fontSize, setFontSize] = useState(18);

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

  const content = chapter?.content ?? "";
  const { isPlaying, wordIndex, play, pause, resume, stop } = useTTS(content, speed, voiceURI);

  // Auto-save progress when reading
  useEffect(() => {
    if (wordIndex >= 0) {
      const timeout = setTimeout(() => {
        updateProgress.mutate(
          { id: bookId, data: { currentChapter: chapterNumber, characterPosition: wordIndex } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getGetReadingProgressQueryKey(bookId) });
            },
          }
        );
      }, 3000);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [wordIndex, bookId, chapterNumber]);

  // Save progress on chapter change
  useEffect(() => {
    updateProgress.mutate({ id: bookId, data: { currentChapter: chapterNumber, characterPosition: 0 } });
  }, [chapterNumber, bookId]);

  const totalChapters = book?.totalChapters ?? 0;
  const hasPrev = chapterNumber > 1;
  const hasNext = chapterNumber < totalChapters;

  const goTo = (num: number) => {
    stop();
    setLocation(`/read/${bookId}/chapter/${num}`);
  };

  // Auto-hide controls
  let hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showControlsTemp = () => {
    setShowControls(true);
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    if (isPlaying) {
      hideTimeout.current = setTimeout(() => setShowControls(false), 4000);
    }
  };

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    }
  }, [isPlaying]);

  return (
    <div
      className="min-h-screen bg-background relative"
      onMouseMove={showControlsTemp}
      onTouchStart={showControlsTemp}
    >
      {/* Top Bar */}
      <AnimatePresence>
        {showControls && (
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-0 left-0 right-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border"
          >
            <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
              <Button variant="ghost" size="icon" asChild>
                <Link href={`/book/${bookId}`} data-testid="btn-back" onClick={() => stop()}>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </Button>
              <div className="flex-1 text-center min-w-0">
                <p className="font-serif text-sm font-medium truncate text-foreground">{book?.title}</p>
                <p className="text-xs text-muted-foreground">
                  {chapter?.title ?? `Chapter ${chapterNumber}`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSummary((v) => !v)}
                  data-testid="btn-summary"
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" asChild data-testid="btn-ask">
                  <Link href={`/book/${bookId}/ask`} onClick={() => stop()}>
                    <MessageSquare className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Reader Content */}
      <div className="pt-20 pb-48 px-6">
        <div className="max-w-2xl mx-auto">
          {/* Chapter heading */}
          <div className="mb-8 text-center">
            <Badge variant="outline" className="mb-3 text-xs">
              Chapter {chapterNumber} of {totalChapters}
            </Badge>
            <h2 className="font-serif text-2xl font-bold text-foreground">
              {chapter?.title ?? `Chapter ${chapterNumber}`}
            </h2>
            {chapter && (
              <p className="text-xs text-muted-foreground mt-2">
                {chapter.wordCount.toLocaleString()} words
              </p>
            )}
          </div>

          {chapterLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className={`h-4 ${i % 4 === 3 ? "w-3/4" : "w-full"}`} />
              ))}
            </div>
          ) : chapter ? (
            <div style={{ fontSize: `${fontSize}px` }}>
              <ChapterText content={chapter.content} wordIndex={wordIndex} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom TTS Controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-0 left-0 right-0 z-20 bg-background/95 backdrop-blur-sm border-t border-border"
          >
            <div className="max-w-3xl mx-auto px-6 py-4 space-y-3">
              {/* Main controls */}
              <div className="flex items-center justify-between gap-4">
                {/* Nav */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => goTo(chapterNumber - 1)}
                    disabled={!hasPrev}
                    data-testid="btn-prev-chapter"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => goTo(chapterNumber + 1)}
                    disabled={!hasNext}
                    data-testid="btn-next-chapter"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                {/* Play / Pause / Stop */}
                <div className="flex items-center gap-2">
                  {isPlaying ? (
                    <Button onClick={pause} size="icon" data-testid="btn-pause">
                      <Pause className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button onClick={resume} size="icon" data-testid="btn-play" disabled={chapterLoading}>
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="outline" size="icon" onClick={stop} data-testid="btn-stop">
                    <Square className="w-4 h-4" />
                  </Button>
                </div>

                {/* Font size */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setFontSize((s) => Math.max(14, s - 1))}
                    className="text-xs px-2 py-1 rounded hover:bg-accent transition-colors font-mono"
                    data-testid="btn-font-decrease"
                  >
                    A−
                  </button>
                  <button
                    onClick={() => setFontSize((s) => Math.min(24, s + 1))}
                    className="text-xs px-2 py-1 rounded hover:bg-accent transition-colors font-mono"
                    data-testid="btn-font-increase"
                  >
                    A+
                  </button>
                </div>
              </div>

              {/* Speed + Voice */}
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2 flex-1 min-w-[160px]">
                  <Volume2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <Slider
                    value={[speed]}
                    min={0.5}
                    max={2}
                    step={0.1}
                    onValueChange={([v]) => { setSpeed(v); if (isPlaying) { stop(); setTimeout(play, 50); } }}
                    className="flex-1"
                    data-testid="slider-speed"
                  />
                  <span className="text-xs text-muted-foreground w-8 shrink-0">{speed.toFixed(1)}×</span>
                </div>
                <VoiceSelector value={voiceURI} onChange={setVoiceURI} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary Sidebar */}
      <AnimatePresence>
        {showSummary && (
          <SummaryPanel bookId={bookId} chapterNumber={chapterNumber} onClose={() => setShowSummary(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
