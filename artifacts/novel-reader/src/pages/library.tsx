import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  BookOpen, Plus, Heart, Clock, Star, Search, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useListBooks,
  useGetRecentActivity,
  useUpdateBook,
  getListBooksQueryKey,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};
const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full bg-primary rounded-full transition-all"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

function BookCard({ book, onFavorite }: {
  book: {
    id: number;
    title: string;
    author?: string | null;
    totalChapters: number;
    isFavorite: boolean;
    tags: string[];
  };
  onFavorite: (id: number, val: boolean) => void;
}) {
  return (
    <motion.div variants={item} layout>
      <Link href={`/book/${book.id}`} data-testid={`card-book-${book.id}`}>
        <div className="group relative bg-card border border-card-border rounded-xl p-5 hover:shadow-md transition-all duration-200 cursor-pointer hover:border-primary/30">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-serif font-semibold text-foreground text-base leading-tight truncate group-hover:text-primary transition-colors">
                {book.title}
              </h3>
              {book.author && (
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{book.author}</p>
              )}
            </div>
            <button
              data-testid={`btn-favorite-${book.id}`}
              onClick={(e) => { e.preventDefault(); onFavorite(book.id, !book.isFavorite); }}
              className="shrink-0 p-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <Heart
                className={`w-4 h-4 transition-colors ${book.isFavorite ? "fill-primary text-primary" : "text-muted-foreground"}`}
              />
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <BookOpen className="w-3.5 h-3.5" />
            <span>{book.totalChapters} chapters</span>
          </div>
          {book.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {book.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs px-2 py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

function RecentCard({ book }: {
  book: {
    id: number;
    title: string;
    author?: string | null;
    currentChapter: number;
    totalChapters: number;
    percentComplete: number;
    lastReadAt?: string | null;
  };
}) {
  return (
    <motion.div variants={item}>
      <Link href={`/read/${book.id}/chapter/${book.currentChapter}`}>
        <div
          data-testid={`card-recent-${book.id}`}
          className="group bg-card border border-card-border rounded-xl p-4 hover:shadow-md transition-all duration-200 cursor-pointer hover:border-primary/30 min-w-[220px] max-w-[260px]"
        >
          <div className="flex items-center gap-2 text-primary mb-2">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{book.percentComplete}% complete</span>
          </div>
          <h3 className="font-serif font-semibold text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors mb-1">
            {book.title}
          </h3>
          {book.author && (
            <p className="text-xs text-muted-foreground truncate mb-3">{book.author}</p>
          )}
          <ProgressBar value={book.percentComplete} />
          <p className="text-xs text-muted-foreground mt-2">
            Chapter {book.currentChapter} of {book.totalChapters}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

export default function LibraryPage() {
  const [search, setSearch] = useState("");
  const { data: books, isLoading: booksLoading } = useListBooks();
  const { data: recent } = useGetRecentActivity();
  const updateBook = useUpdateBook();
  const queryClient = useQueryClient();

  const handleFavorite = (id: number, val: boolean) => {
    updateBook.mutate(
      { id, data: { isFavorite: val } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
        },
      }
    );
  };

  const filtered = books?.filter(
    (b) =>
      b.title.toLowerCase().includes(search.toLowerCase()) ||
      (b.author ?? "").toLowerCase().includes(search.toLowerCase()) ||
      b.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  const favorites = filtered?.filter((b) => b.isFavorite) ?? [];
  const all = filtered ?? [];

  const recentWithActivity = recent?.filter((r) => r.currentChapter > 1 || r.lastReadAt) ?? [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary-foreground" />
            </div>
            <h1 className="font-serif text-xl font-semibold text-foreground">NoveLit</h1>
          </div>
          <div className="flex items-center gap-3 flex-1 max-w-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="input-search"
                className="pl-9"
                placeholder="Search library..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <Button asChild data-testid="btn-import">
            <Link href="/import">
              <Plus className="w-4 h-4 mr-2" />
              Import
            </Link>
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Continue Reading */}
        {recentWithActivity.length > 0 && !search && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-primary" />
              <h2 className="font-serif text-lg font-semibold">Continue Reading</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
              <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="flex gap-4"
              >
                {recentWithActivity.map((book) => (
                  <RecentCard key={book.id} book={book} />
                ))}
              </motion.div>
            </div>
          </section>
        )}

        {/* Favorites */}
        {favorites.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-4 h-4 text-primary fill-primary" />
              <h2 className="font-serif text-lg font-semibold">Favorites</h2>
            </div>
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {favorites.map((book) => (
                <BookCard key={book.id} book={book} onFavorite={handleFavorite} />
              ))}
            </motion.div>
          </section>
        )}

        {/* All Books */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-serif text-lg font-semibold">
                {search ? `Results (${all.length})` : "All Books"}
              </h2>
            </div>
          </div>

          {booksLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : all.length === 0 ? (
            <div className="text-center py-20 flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center">
                <BookOpen className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-serif text-lg font-medium text-foreground">
                  {search ? "No books match your search" : "Your library is empty"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {search ? "Try a different search term" : "Import a novel to get started"}
                </p>
              </div>
              {!search && (
                <Button asChild variant="outline">
                  <Link href="/import">
                    <Plus className="w-4 h-4 mr-2" />
                    Import your first novel
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {all.map((book) => (
                <BookCard key={book.id} book={book} onFavorite={handleFavorite} />
              ))}
            </motion.div>
          )}
        </section>
      </main>
    </div>
  );
}
