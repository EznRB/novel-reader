import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  BookOpen, Plus, Heart, Clock, Search, ChevronRight,
  BarChart2, Flame, User, Trash2, ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useListBooks,
  useGetRecentActivity,
  useUpdateBook,
  getListBooksQueryKey,
  getGetRecentActivityQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const TABS = ["Todos", "Favoritos", "Lendo"] as const;
type Tab = (typeof TABS)[number];

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

function CoverPlaceholder({ title, id }: { title: string; id: number }) {
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
  const color = COLORS[id % COLORS.length];
  const initials = title.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <div className={`w-full h-full bg-gradient-to-br ${color} flex items-center justify-center`}>
      <span className="text-white/80 font-serif text-2xl font-bold">{initials}</span>
    </div>
  );
}

type BookItem = {
  id: number;
  title: string;
  author?: string | null;
  totalChapters: number;
  isFavorite: boolean;
  tags: string[];
  coverImage?: string | null;
};

function BookCard({
  book,
  progress,
  onFavorite,
  onDelete,
}: {
  book: BookItem;
  progress?: { currentChapter: number; percentComplete: number } | null;
  onFavorite: (id: number, val: boolean) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <motion.div variants={fadeUp} layout>
      <Link href={`/book/${book.id}`} data-testid={`card-book-${book.id}`}>
        <div className="group relative bg-card border border-border rounded-lg overflow-hidden hover:border-primary/60 transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-black/30">
          {/* Capa */}
          <div className="aspect-[2/3] relative overflow-hidden">
            {book.coverImage ? (
              <img src={book.coverImage} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <CoverPlaceholder title={book.title} id={book.id} />
            )}
            {/* Barra de progresso */}
            {progress && progress.percentComplete > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                <div className="progress-bar-fill" style={{ width: `${progress.percentComplete}%` }} />
              </div>
            )}
            {/* Badge "Lendo" */}
            {progress && progress.currentChapter > 1 && (
              <div className="absolute top-2 left-2">
                <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-primary text-primary-foreground rounded uppercase tracking-wide">
                  Lendo
                </span>
              </div>
            )}
            {/* Botões de ação — visíveis ao hover */}
            <div className="absolute top-2 right-2 flex flex-col gap-1.5">
              <button
                data-testid={`btn-favorite-${book.id}`}
                onClick={(e) => { e.preventDefault(); onFavorite(book.id, !book.isFavorite); }}
                className="p-1.5 bg-black/50 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
              >
                <Heart className={`w-3.5 h-3.5 ${book.isFavorite ? "fill-primary text-primary" : "text-white"}`} />
              </button>
              <button
                data-testid={`btn-delete-${book.id}`}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(book.id); }}
                className="p-1.5 bg-black/50 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600/80"
              >
                <Trash2 className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
          {/* Informações */}
          <div className="p-3">
            <h3 className="font-medium text-foreground text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {book.title}
            </h3>
            {book.author && (
              <p className="text-xs text-muted-foreground mt-1 truncate">{book.author}</p>
            )}
            <div className="flex items-center gap-1 mt-2">
              <span className="text-xs text-muted-foreground">{book.totalChapters} cap.</span>
              {book.tags.slice(0, 1).map((t) => (
                <span key={t} className="genre-chip ml-1">{t}</span>
              ))}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function RecentRow({ book }: {
  book: { id: number; title: string; author?: string | null; currentChapter: number; totalChapters: number; percentComplete: number };
}) {
  return (
    <Link href={`/read/${book.id}/chapter/${book.currentChapter}`}>
      <div
        data-testid={`card-recent-${book.id}`}
        className="group flex items-center gap-3 bg-card border border-border rounded-lg p-3 hover:border-primary/50 transition-all cursor-pointer"
      >
        <div className="w-10 h-14 rounded overflow-hidden shrink-0">
          <CoverPlaceholder title={book.title} id={book.id} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground line-clamp-1 group-hover:text-primary transition-colors">
            {book.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cap. {book.currentChapter} / {book.totalChapters}
          </p>
          <div className="w-full h-1 bg-secondary rounded-full mt-2 overflow-hidden">
            <div className="progress-bar-fill" style={{ width: `${book.percentComplete}%` }} />
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

type SortKey = "recent" | "title-asc" | "title-desc" | "favorites" | "progress";

export default function LibraryPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("Todos");
  const [sort, setSort] = useState<SortKey>("recent");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const { data: books, isLoading } = useListBooks();
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

  const handleDeleteRequest = (id: number) => {
    const book = books?.find((b) => b.id === id);
    if (book) setDeleteTarget({ id, title: book.title });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
    try {
      await fetch(`${base}/api/books/${deleteTarget.id}`, { method: "DELETE" });
      queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
    } catch {
      /* silent */
    } finally {
      setDeleteTarget(null);
    }
  };

  const progressMap = new Map(
    (recent ?? []).map((r) => [r.id, { currentChapter: r.currentChapter, percentComplete: r.percentComplete }])
  );

  const filtered = (books ?? []).filter((b) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      b.title.toLowerCase().includes(q) ||
      (b.author ?? "").toLowerCase().includes(q) ||
      b.tags.some((t) => t.toLowerCase().includes(q));
    const matchesTab =
      tab === "Todos" ||
      (tab === "Favoritos" && b.isFavorite) ||
      (tab === "Lendo" && (progressMap.get(b.id)?.currentChapter ?? 1) > 1);
    return matchesSearch && matchesTab;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === "title-asc") return a.title.localeCompare(b.title, "pt-BR");
    if (sort === "title-desc") return b.title.localeCompare(a.title, "pt-BR");
    if (sort === "favorites") {
      if (a.isFavorite === b.isFavorite) return 0;
      return a.isFavorite ? -1 : 1;
    }
    if (sort === "progress") {
      const pa = progressMap.get(a.id)?.percentComplete ?? 0;
      const pb = progressMap.get(b.id)?.percentComplete ?? 0;
      return pb - pa;
    }
    return 0;
  });

  const recentActive = (recent ?? []).filter((r) => r.currentChapter > 1 || r.lastReadAt).slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      {/* Cabeçalho */}
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground text-lg hidden sm:block">NoveLit</span>
          </Link>

          {/* Busca */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              data-testid="input-search"
              className="pl-9 bg-secondary border-border text-sm h-9"
              placeholder="Buscar título, autor, tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" size="icon" className="h-9 w-9" asChild title="Perfil">
              <Link href="/profile" data-testid="btn-profile">
                <User className="w-4 h-4" />
              </Link>
            </Button>
            <Button asChild size="sm" data-testid="btn-import" className="bg-primary hover:bg-primary/90">
              <Link href="/import">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Importar
              </Link>
            </Button>
          </div>
        </div>

        {/* Abas */}
        <div className="max-w-6xl mx-auto px-4 pb-0">
          <div className="flex items-center gap-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-${t.toLowerCase()}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Continuar lendo */}
        {tab === "Todos" && !search && recentActive.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Continuar Lendo</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentActive.map((b) => (
                <RecentRow key={b.id} book={b} />
              ))}
            </div>
          </section>
        )}

        {/* Barra de stats */}
        {!search && books && books.length > 0 && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" />{books.length} novels</span>
            <span className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5" />{books.filter((b) => b.isFavorite).length} favoritos</span>
            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{recentActive.length} em andamento</span>
            <div className="ml-auto">
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="h-7 w-auto border-0 bg-transparent text-xs text-muted-foreground gap-1.5 px-2 hover:text-foreground transition-colors focus:ring-0 shadow-none">
                  <ArrowUpDown className="w-3 h-3" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="recent" className="text-xs">Atualizado recentemente</SelectItem>
                  <SelectItem value="title-asc" className="text-xs">Título A → Z</SelectItem>
                  <SelectItem value="title-desc" className="text-xs">Título Z → A</SelectItem>
                  <SelectItem value="favorites" className="text-xs">Favoritos primeiro</SelectItem>
                  <SelectItem value="progress" className="text-xs">Mais progresso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Grid */}
        <section>
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[2/3] rounded-lg" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center">
                <BookOpen className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {search
                    ? "Nenhum resultado encontrado"
                    : tab !== "Todos"
                    ? `Nenhum livro em "${tab}"`
                    : "Sua biblioteca está vazia"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {search ? "Tente outra busca" : "Importe um romance para começar"}
                </p>
              </div>
              {!search && tab === "Todos" && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/import"><Plus className="w-3.5 h-3.5 mr-1.5" />Importar seu primeiro romance</Link>
                </Button>
              )}
            </div>
          ) : (
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
            >
              {sorted.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  progress={progressMap.get(book.id)}
                  onFavorite={handleFavorite}
                  onDelete={handleDeleteRequest}
                />
              ))}
            </motion.div>
          )}
        </section>
      </main>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá permanentemente o livro e todos os seus capítulos, progresso de leitura, resumos e dados de personagens. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
