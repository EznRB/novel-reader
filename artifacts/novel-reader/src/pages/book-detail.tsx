import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, BookOpen, Heart, MessageSquare, Users,
  ChevronRight, Sparkles, BarChart2, Loader2,
  Download, FileText, BookMarked,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  useGetBook,
  useGetBookStats,
  useListChapters,
  useGetReadingProgress,
  useListCharacters,
  useExtractCharacters,
  useUpdateBook,
  getGetBookQueryKey,
  getGetBookStatsQueryKey,
  getListChaptersQueryKey,
  getGetReadingProgressQueryKey,
  getListCharactersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const fadeUp = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };

const COLORS = [
  "from-orange-900 to-orange-700",
  "from-blue-900 to-blue-700",
  "from-purple-900 to-purple-700",
  "from-green-900 to-green-700",
  "from-rose-900 to-rose-700",
  "from-cyan-900 to-cyan-700",
  "from-amber-900 to-amber-700",
  "from-indigo-900 to-indigo-700",
];

function CoverArt({ title, id, large }: { title: string; id: number; large?: boolean }) {
  const color = COLORS[id % COLORS.length];
  const words = title.trim().split(/\s+/);
  return (
    <div className={`w-full h-full bg-gradient-to-br ${color} flex flex-col items-center justify-center p-4`}>
      <BookOpen className={`${large ? "w-12 h-12" : "w-8 h-8"} text-white/30 mb-2`} />
      <p className="text-white/80 font-serif text-center text-sm font-medium leading-tight line-clamp-4">
        {words.slice(0, 6).join(" ")}
      </p>
    </div>
  );
}

function StatPill({ value, label, icon: Icon }: {
  value: string | number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center gap-1 bg-secondary/60 rounded-xl px-4 py-3 border border-border min-w-[80px]">
      <Icon className="w-4 h-4 text-primary" />
      <span className="text-base font-bold text-foreground" data-testid={`stat-${label}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

export default function BookDetailPage({ params }: { params: { id: string } }) {
  const bookId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [extracting, setExtracting] = useState(false);

  const { data: book, isLoading: bookLoading } = useGetBook(bookId, {
    query: { enabled: !!bookId, queryKey: getGetBookQueryKey(bookId) },
  });
  const { data: stats } = useGetBookStats(bookId, {
    query: { enabled: !!bookId, queryKey: getGetBookStatsQueryKey(bookId) },
  });
  const { data: chapters, isLoading: chaptersLoading } = useListChapters(bookId, {
    query: { enabled: !!bookId, queryKey: getListChaptersQueryKey(bookId) },
  });
  const { data: progress } = useGetReadingProgress(bookId, {
    query: { enabled: !!bookId, queryKey: getGetReadingProgressQueryKey(bookId) },
  });
  const { data: characters } = useListCharacters(bookId, {
    query: { enabled: !!bookId, queryKey: getListCharactersQueryKey(bookId) },
  });

  const extractCharacters = useExtractCharacters();
  const updateBook = useUpdateBook();

  const currentChapter = progress?.currentChapter ?? 1;

  const handleFavorite = () => {
    if (!book) return;
    updateBook.mutate(
      { id: bookId, data: { isFavorite: !book.isFavorite } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBookQueryKey(bookId) }) }
    );
  };

  const handleExtract = () => {
    setExtracting(true);
    extractCharacters.mutate(
      { id: bookId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCharactersQueryKey(bookId) });
          toast({ title: "Characters extracted", description: "AI identified characters in your novel." });
          setExtracting(false);
        },
        onError: () => {
          toast({ title: "Failed", description: "Could not extract characters.", variant: "destructive" });
          setExtracting(false);
        },
      }
    );
  };

  const handleExport = (format: "pdf" | "epub") => {
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    window.open(`${base}/api/books/${bookId}/export/${format}`, "_blank");
  };

  if (bookLoading) {
    return (
      <div className="min-h-screen bg-background p-6 max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-32" />
        <div className="flex gap-6">
          <Skeleton className="w-36 h-52 rounded-lg shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Book not found</p>
          <Button asChild variant="link"><Link href="/">Back to library</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/" data-testid="btn-back"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <span className="flex-1 font-medium text-sm text-foreground truncate">{book.title}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleFavorite} data-testid="btn-favorite">
              <Heart className={`w-4 h-4 ${book.isFavorite ? "fill-primary text-primary" : ""}`} />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link href={`/book/${bookId}/ask`} data-testid="btn-ask">
                <MessageSquare className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* Hero */}
        <div className="flex gap-5 items-start">
          {/* Cover */}
          <div className="w-32 h-48 sm:w-40 sm:h-60 rounded-lg overflow-hidden border border-border shrink-0 shadow-xl">
            <CoverArt title={book.title} id={bookId} large />
          </div>

          {/* Meta */}
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <h1 className="font-serif text-2xl font-bold text-foreground leading-tight" data-testid="text-book-title">
                {book.title}
              </h1>
              {book.author && (
                <p className="text-muted-foreground text-sm mt-1" data-testid="text-book-author">by {book.author}</p>
              )}
            </div>

            {book.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {book.tags.map((t) => (
                  <span key={t} className="genre-chip">{t}</span>
                ))}
              </div>
            )}

            {/* Stats row */}
            {stats && (
              <div className="flex flex-wrap gap-2">
                <StatPill value={stats.totalChapters} label="Chapters" icon={BookOpen} />
                <StatPill value={(stats.totalWords / 1000).toFixed(0) + "k"} label="Words" icon={BarChart2} />
                <StatPill value={stats.characterCount} label="Characters" icon={Users} />
                <StatPill value={`${stats.percentComplete}%`} label="Progress" icon={BookMarked} />
              </div>
            )}

            {/* Progress bar */}
            {stats && stats.percentComplete > 0 && (
              <div className="space-y-1">
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="progress-bar-fill" style={{ width: `${stats.percentComplete}%` }} />
                </div>
              </div>
            )}

            {/* CTA buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={() => setLocation(`/read/${bookId}/chapter/${currentChapter}`)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                data-testid="btn-start-reading"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                {stats && stats.percentComplete > 0 ? `Continue Ch.${currentChapter}` : "Start Reading"}
              </Button>
              <Button variant="outline" asChild data-testid="btn-ask-ai">
                <Link href={`/book/${bookId}/ask`}>
                  <MessageSquare className="w-3.5 h-3.5 mr-2" />AI Q&A
                </Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleExport("epub")} title="Export EPUB" data-testid="btn-export-epub">
                <Download className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleExport("pdf")} title="Export PDF" data-testid="btn-export-pdf">
                <FileText className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        {/* Characters */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Characters</h2>
              {characters && characters.length > 0 && (
                <Badge variant="secondary" className="text-xs">{characters.length}</Badge>
              )}
            </div>
            <Button
              variant="outline" size="sm"
              onClick={handleExtract}
              disabled={extracting}
              className="h-7 text-xs"
              data-testid="btn-extract-characters"
            >
              {extracting ? (
                <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Extracting…</>
              ) : (
                <><Sparkles className="w-3 h-3 mr-1.5" />Extract with AI</>
              )}
            </Button>
          </div>

          {characters && characters.length > 0 ? (
            <motion.div variants={stagger} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {characters.map((c) => (
                <motion.div
                  key={c.id}
                  variants={fadeUp}
                  data-testid={`card-character-${c.id}`}
                  className="bg-card border border-border rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="font-medium text-foreground text-sm">{c.name}</h3>
                    {c.role && <Badge variant="outline" className="text-[10px] shrink-0 capitalize">{c.role}</Badge>}
                  </div>
                  {c.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{c.description}</p>
                  )}
                  {c.firstAppearanceChapter && (
                    <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                      First: Ch.{c.firstAppearanceChapter}
                    </p>
                  )}
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="border border-dashed border-border rounded-xl p-8 text-center">
              <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No characters yet. Use AI to extract them.</p>
            </div>
          )}
        </section>

        <Separator />

        {/* Chapter list */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Chapters</h2>
            {chapters && <Badge variant="secondary" className="text-xs">{chapters.length}</Badge>}
          </div>

          {chaptersLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-1">
              {chapters?.map((ch) => {
                const isRead = ch.chapterNumber < currentChapter;
                const isCurrent = ch.chapterNumber === currentChapter;
                return (
                  <motion.div key={ch.id} variants={fadeUp}>
                    <Link href={`/read/${bookId}/chapter/${ch.chapterNumber}`}>
                      <div
                        data-testid={`item-chapter-${ch.chapterNumber}`}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all group
                          hover:bg-secondary/60
                          ${isCurrent ? "bg-primary/10 border border-primary/30" : ""}
                        `}
                      >
                        <span className={`text-xs font-mono w-6 shrink-0 ${isCurrent ? "text-primary font-bold" : "text-muted-foreground"}`}>
                          {String(ch.chapterNumber).padStart(2, "0")}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isCurrent ? "text-primary" : isRead ? "text-muted-foreground" : "text-foreground"}`}>
                            {ch.title ?? `Chapter ${ch.chapterNumber}`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{ch.wordCount.toLocaleString()} words</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isCurrent && <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30 hover:bg-primary/20">Reading</Badge>}
                          {isRead && !isCurrent && <Badge variant="secondary" className="text-[10px]">Done</Badge>}
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </section>
      </main>
    </div>
  );
}
