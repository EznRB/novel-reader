import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, BookOpen, Heart, MessageSquare, Users,
  ChevronRight, Sparkles, TrendingUp, BarChart2, Loader2,
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

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-accent-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold text-foreground text-sm" data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>{value}</p>
      </div>
    </div>
  );
}

export default function BookDetailPage({ params }: { params: { id: string } }) {
  const bookId = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const [extracting, setExtracting] = useState(false);

  const handleFavorite = () => {
    if (!book) return;
    updateBook.mutate(
      { id: bookId, data: { isFavorite: !book.isFavorite } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBookQueryKey(bookId) }),
      }
    );
  };

  const handleExtract = () => {
    setExtracting(true);
    extractCharacters.mutate(
      { id: bookId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCharactersQueryKey(bookId) });
          toast({ title: "Characters extracted!", description: "AI has identified characters from your reading." });
          setExtracting(false);
        },
        onError: () => {
          toast({ title: "Extraction failed", description: "Could not extract characters.", variant: "destructive" });
          setExtracting(false);
        },
      }
    );
  };

  const currentChapter = progress?.currentChapter ?? 1;

  if (bookLoading) {
    return (
      <div className="min-h-screen bg-background p-8 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-3 gap-4 mt-6">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Book not found</p>
          <Button asChild variant="link" className="mt-2">
            <Link href="/">Back to library</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/" data-testid="btn-back"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleFavorite}
              data-testid="btn-favorite"
              disabled={updateBook.isPending}
            >
              <Heart className={`w-4 h-4 ${book.isFavorite ? "fill-primary text-primary" : ""}`} />
            </Button>
            <Button variant="ghost" size="icon" asChild data-testid="btn-ask">
              <Link href={`/book/${bookId}/ask`}>
                <MessageSquare className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Book Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {book.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
            ))}
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground leading-tight" data-testid="text-book-title">
            {book.title}
          </h1>
          {book.author && (
            <p className="text-muted-foreground text-base" data-testid="text-book-author">by {book.author}</p>
          )}
          {book.description && (
            <p className="text-foreground/80 leading-relaxed">{book.description}</p>
          )}

          {/* Progress bar */}
          {stats && stats.chaptersRead > 0 && (
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progress</span>
                <span>{stats.percentComplete}% complete</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${stats.percentComplete}%` }}
                />
              </div>
            </div>
          )}

          {/* Start / Continue button */}
          <div className="flex gap-3 pt-2">
            <Button
              size="lg"
              onClick={() => setLocation(`/read/${bookId}/chapter/${currentChapter}`)}
              data-testid="btn-start-reading"
            >
              <BookOpen className="w-4 h-4 mr-2" />
              {stats && stats.chaptersRead > 0 ? `Continue — Chapter ${currentChapter}` : "Start Reading"}
            </Button>
            <Button variant="outline" size="lg" asChild data-testid="btn-ask-ai">
              <Link href={`/book/${bookId}/ask`}>
                <MessageSquare className="w-4 h-4 mr-2" />
                Ask AI
              </Link>
            </Button>
          </div>
        </motion.div>

        <Separator />

        {/* Stats */}
        {stats && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Chapters" value={stats.totalChapters} icon={BookOpen} />
              <StatCard label="Words" value={stats.totalWords.toLocaleString()} icon={BarChart2} />
              <StatCard label="Characters" value={stats.characterCount} icon={Users} />
              <StatCard label="Summaries" value={stats.summaryCount} icon={TrendingUp} />
            </div>
          </motion.div>
        )}

        {/* Characters */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-serif text-lg font-semibold">Characters</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExtract}
              disabled={extracting}
              data-testid="btn-extract-characters"
            >
              {extracting ? (
                <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Extracting...</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5 mr-2" />Extract with AI</>
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
                  className="bg-card border border-card-border rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-medium text-foreground text-sm">{c.name}</h3>
                    {c.role && (
                      <Badge variant="outline" className="text-xs shrink-0">{c.role}</Badge>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{c.description}</p>
                  )}
                  {c.firstAppearanceChapter && (
                    <p className="text-xs text-muted-foreground mt-2">First appears: Ch. {c.firstAppearanceChapter}</p>
                  )}
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="bg-muted/40 border border-dashed border-border rounded-xl p-6 text-center">
              <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No characters yet. Click "Extract with AI" to identify characters from your reading.</p>
            </div>
          )}
        </section>

        <Separator />

        {/* Chapter List */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-serif text-lg font-semibold">Chapters</h2>
          </div>

          {chaptersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-1.5">
              {chapters?.map((chapter) => {
                const isRead = chapter.chapterNumber < currentChapter;
                const isCurrent = chapter.chapterNumber === currentChapter;
                return (
                  <motion.div key={chapter.id} variants={fadeUp}>
                    <Link href={`/read/${bookId}/chapter/${chapter.chapterNumber}`}>
                      <div
                        data-testid={`item-chapter-${chapter.chapterNumber}`}
                        className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all hover:bg-accent/50 group
                          ${isCurrent ? "bg-accent border border-primary/20" : ""}
                          ${isRead ? "opacity-70" : ""}
                        `}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`text-xs font-mono w-8 shrink-0 ${isCurrent ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                            {String(chapter.chapterNumber).padStart(2, "0")}
                          </span>
                          <div className="min-w-0">
                            <p className={`text-sm font-medium truncate ${isCurrent ? "text-primary" : "text-foreground"}`}>
                              {chapter.title ?? `Chapter ${chapter.chapterNumber}`}
                            </p>
                            <p className="text-xs text-muted-foreground">{chapter.wordCount.toLocaleString()} words</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isCurrent && (
                            <Badge variant="outline" className="text-xs border-primary/40 text-primary">Reading</Badge>
                          )}
                          {isRead && (
                            <Badge variant="secondary" className="text-xs">Read</Badge>
                          )}
                          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
