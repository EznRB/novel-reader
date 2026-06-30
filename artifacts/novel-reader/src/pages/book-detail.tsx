import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, BookOpen, Heart, MessageSquare, Users,
  ChevronRight, Sparkles, BarChart2, Loader2,
  Download, FileText, BookMarked, Camera, Trash2,
  Brain, MapPin, Building2, Swords, Gem, Zap, Calendar,
  Mic, Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useGetBook,
  useGetBookStats,
  useListChapters,
  useGetReadingProgress,
  useListCharacters,
  useExtractCharacters,
  useUpdateBook,
  useListBookKnowledge,
  useExtractBookKnowledge,
  useAssignCharacterVoices,
  getGetBookQueryKey,
  getGetBookStatsQueryKey,
  getListChaptersQueryKey,
  getGetReadingProgressQueryKey,
  getListCharactersQueryKey,
  getListBookKnowledgeQueryKey,
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

const ENTITY_TYPE_CONFIG = [
  { type: "character",     label: "Personagens",        icon: Users,     color: "text-blue-400",   bg: "bg-blue-950/40 border-blue-800/40"   },
  { type: "organization",  label: "Organizações",        icon: Building2, color: "text-purple-400", bg: "bg-purple-950/40 border-purple-800/40" },
  { type: "faction",       label: "Facções",             icon: Swords,    color: "text-red-400",    bg: "bg-red-950/40 border-red-800/40"     },
  { type: "location",      label: "Locais",              icon: MapPin,    color: "text-green-400",  bg: "bg-green-950/40 border-green-800/40" },
  { type: "skill",         label: "Habilidades & Poderes",icon: Zap,      color: "text-yellow-400", bg: "bg-yellow-950/40 border-yellow-800/40"},
  { type: "artifact",      label: "Artefatos",           icon: Gem,       color: "text-orange-400", bg: "bg-orange-950/40 border-orange-800/40"},
  { type: "event",         label: "Eventos Importantes", icon: Calendar,  color: "text-cyan-400",   bg: "bg-cyan-950/40 border-cyan-800/40"   },
] as const;

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
  const [extractingKnowledge, setExtractingKnowledge] = useState(false);
  const [assigningVoices, setAssigningVoices] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const { data: knowledge } = useListBookKnowledge(bookId, {
    query: { enabled: !!bookId, queryKey: getListBookKnowledgeQueryKey(bookId) },
  });

  const extractCharacters = useExtractCharacters();
  const extractKnowledge = useExtractBookKnowledge();
  const assignVoices = useAssignCharacterVoices();
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
          toast({ title: "Personagens extraídos", description: "A IA identificou os personagens do seu romance." });
          setExtracting(false);
        },
        onError: () => {
          toast({ title: "Falhou", description: "Não foi possível extrair os personagens.", variant: "destructive" });
          setExtracting(false);
        },
      }
    );
  };

  const handleExtractKnowledge = () => {
    setExtractingKnowledge(true);
    extractKnowledge.mutate(
      { id: bookId },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListBookKnowledgeQueryKey(bookId) });
          toast({
            title: "Memória extraída",
            description: `${data.totalEntities} entidades encontradas até o capítulo ${data.extractedFromChapter}.`,
          });
          setExtractingKnowledge(false);
        },
        onError: () => {
          toast({ title: "Falhou", description: "Não foi possível extrair o conhecimento do mundo.", variant: "destructive" });
          setExtractingKnowledge(false);
        },
      }
    );
  };

  const handleAssignVoices = () => {
    setAssigningVoices(true);
    assignVoices.mutate(
      { id: bookId },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListCharactersQueryKey(bookId) });
          toast({
            title: "Vozes atribuídas",
            description: `${data.characters.length} personagens receberam vozes únicas. Narrador: ${data.narratorVoice}.`,
          });
          setAssigningVoices(false);
        },
        onError: () => {
          toast({ title: "Falhou", description: "Não foi possível atribuir vozes.", variant: "destructive" });
          setAssigningVoices(false);
        },
      }
    );
  };

  const handleExport = (format: "pdf" | "epub") => {
    const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
    window.open(`${base}/api/books/${bookId}/export/${format}`, "_blank");
  };

  const handleDelete = async () => {
    const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
    try {
      const res = await fetch(`${base}/api/books/${bookId}`, { method: "DELETE" });
      if (res.ok || res.status === 204) {
        setLocation("/");
      } else {
        toast({ title: "Falha ao excluir", description: "Não foi possível excluir este livro.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Falha ao excluir", description: "Erro de rede.", variant: "destructive" });
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverUploading(true);
    const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
    const formData = new FormData();
    formData.append("cover", file);
    try {
      const res = await fetch(`${base}/api/books/${bookId}/cover`, { method: "POST", body: formData });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: getGetBookQueryKey(bookId) });
        toast({ title: "Capa atualizada!" });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Falha no upload", description: (err as { error?: string }).error ?? "Erro desconhecido", variant: "destructive" });
      }
    } catch {
      toast({ title: "Falha no upload", description: "Erro de rede.", variant: "destructive" });
    } finally {
      setCoverUploading(false);
    }
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
          <p className="text-muted-foreground">Livro não encontrado</p>
          <Button asChild variant="link"><Link href="/">Voltar à biblioteca</Link></Button>
        </div>
      </div>
    );
  }

  const knowledgeByType = ENTITY_TYPE_CONFIG.reduce((acc, { type }) => {
    acc[type] = (knowledge ?? []).filter((e) => e.entityType === type);
    return acc;
  }, {} as Record<string, typeof knowledge>);

  return (
    <div className="min-h-screen bg-background">
      {/* Cabeçalho */}
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  data-testid="btn-delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir "{book.title}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Isso excluirá permanentemente o livro junto com todos os seus capítulos, progresso de leitura, resumos de IA e dados de personagens. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                    Excluir livro
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* Hero */}
        <div className="flex gap-5 items-start">
          <div className="shrink-0">
            <div
              className="w-32 h-48 sm:w-40 sm:h-60 rounded-lg overflow-hidden border border-border shadow-xl relative group cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              title="Clique para trocar a capa"
            >
              {book.coverImage ? (
                <img src={book.coverImage} alt={book.title} className="w-full h-full object-cover" />
              ) : (
                <CoverArt title={book.title} id={bookId} large />
              )}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                {coverUploading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <>
                    <Camera className="w-6 h-6 text-white" />
                    <span className="text-white text-xs font-medium">Trocar Capa</span>
                  </>
                )}
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleCoverUpload}
            />
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <h1 className="font-serif text-2xl font-bold text-foreground leading-tight" data-testid="text-book-title">
                {book.title}
              </h1>
              {book.author && (
                <p className="text-muted-foreground text-sm mt-1" data-testid="text-book-author">por {book.author}</p>
              )}
            </div>

            {book.description && (
              <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-book-description">
                {book.description}
              </p>
            )}

            {book.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {book.tags.map((t) => (
                  <span key={t} className="genre-chip">{t}</span>
                ))}
              </div>
            )}

            {stats && (
              <div className="flex flex-wrap gap-2">
                <StatPill value={stats.totalChapters} label="Capítulos" icon={BookOpen} />
                <StatPill value={(stats.totalWords / 1000).toFixed(0) + "k"} label="Palavras" icon={BarChart2} />
                <StatPill value={stats.characterCount} label="Personagens" icon={Users} />
                <StatPill value={`${stats.percentComplete}%`} label="Progresso" icon={BookMarked} />
              </div>
            )}

            {stats && stats.percentComplete > 0 && (
              <div className="space-y-1">
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="progress-bar-fill" style={{ width: `${stats.percentComplete}%` }} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={() => setLocation(`/read/${bookId}/chapter/${currentChapter}`)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                data-testid="btn-start-reading"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                {stats && stats.percentComplete > 0 ? `Continuar Cap.${currentChapter}` : "Começar a Ler"}
              </Button>
              <Button variant="outline" asChild data-testid="btn-ask-ai">
                <Link href={`/book/${bookId}/ask`}>
                  <MessageSquare className="w-3.5 h-3.5 mr-2" />Perguntar à IA
                </Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleExport("epub")} title="Exportar EPUB" data-testid="btn-export-epub">
                <Download className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleExport("pdf")} title="Exportar PDF" data-testid="btn-export-pdf">
                <FileText className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        {/* Personagens */}
        <section>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Personagens</h2>
              {characters && characters.length > 0 && (
                <Badge variant="secondary" className="text-xs">{characters.length}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {characters && characters.length > 0 && (
                <Button
                  variant="outline" size="sm"
                  onClick={handleAssignVoices}
                  disabled={assigningVoices}
                  className="h-7 text-xs"
                  data-testid="btn-assign-voices"
                >
                  {assigningVoices ? (
                    <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Atribuindo…</>
                  ) : (
                    <><Mic className="w-3 h-3 mr-1.5" />Atribuir Vozes</>
                  )}
                </Button>
              )}
              <Button
                variant="outline" size="sm"
                onClick={handleExtract}
                disabled={extracting}
                className="h-7 text-xs"
                data-testid="btn-extract-characters"
              >
                {extracting ? (
                  <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Extraindo…</>
                ) : (
                  <><Sparkles className="w-3 h-3 mr-1.5" />Extrair com IA</>
                )}
              </Button>
            </div>
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
                    <div className="flex items-center gap-1.5 shrink-0">
                      {c.gender && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {c.gender === "male" ? "masc." : c.gender === "female" ? "fem." : c.gender}
                        </Badge>
                      )}
                      {c.role && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {c.role === "protagonist" ? "Protagonista"
                            : c.role === "antagonist" ? "Antagonista"
                            : c.role === "supporting" ? "Secundário"
                            : c.role === "minor" ? "Menor"
                            : c.role}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {c.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{c.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    {c.firstAppearanceChapter && (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        1ª aparição: Cap.{c.firstAppearanceChapter}
                      </p>
                    )}
                    {c.assignedVoice && (
                      <div className="flex items-center gap-1 text-[10px] text-blue-400">
                        <Volume2 className="w-2.5 h-2.5" />
                        <span className="font-mono truncate max-w-[140px]">{c.assignedVoice}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="border border-dashed border-border rounded-xl p-8 text-center">
              <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum personagem ainda. Use a IA para extraí-los.</p>
            </div>
          )}
        </section>

        <Separator />

        {/* Memória da História */}
        <section>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Memória da História</h2>
              {knowledge && knowledge.length > 0 && (
                <Badge variant="secondary" className="text-xs">{knowledge.length} entidades</Badge>
              )}
            </div>
            <Button
              variant="outline" size="sm"
              onClick={handleExtractKnowledge}
              disabled={extractingKnowledge}
              className="h-7 text-xs"
              data-testid="btn-extract-knowledge"
            >
              {extractingKnowledge ? (
                <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Extraindo…</>
              ) : (
                <><Brain className="w-3 h-3 mr-1.5" />Extrair Mundo</>
              )}
            </Button>
          </div>

          {knowledge && knowledge.length > 0 ? (
            <div className="space-y-5">
              {ENTITY_TYPE_CONFIG.map(({ type, label, icon: Icon, color, bg }) => {
                const items = knowledgeByType[type] ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={type}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`w-3.5 h-3.5 ${color}`} />
                      <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>
                        {label}
                      </p>
                      <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {items.map((entity) => (
                        <div
                          key={entity.id}
                          className={`border rounded-lg p-3 ${bg}`}
                        >
                          <p className="text-sm font-medium text-foreground">{entity.name}</p>
                          {entity.description && (
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                              {entity.description}
                            </p>
                          )}
                          {entity.firstAppearanceChapter && (
                            <p className="text-[10px] text-muted-foreground/60 mt-1.5 font-mono">
                              Cap.{entity.firstAppearanceChapter}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed border-border rounded-xl p-8 text-center">
              <Brain className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhuma memória ainda. Clique em "Extrair Mundo" para construir uma base de conhecimento dos capítulos lidos.
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Extrai personagens, organizações, locais, habilidades, artefatos e eventos importantes.
              </p>
            </div>
          )}
        </section>

        <Separator />

        {/* Lista de capítulos */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground">Capítulos</h2>
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
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all group hover:bg-secondary/60 ${
                          isCurrent ? "bg-primary/10 border border-primary/30" : ""
                        }`}
                      >
                        <span className={`text-xs font-mono w-6 shrink-0 ${isCurrent ? "text-primary font-bold" : "text-muted-foreground"}`}>
                          {String(ch.chapterNumber).padStart(2, "0")}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isCurrent ? "text-primary" : isRead ? "text-muted-foreground" : "text-foreground"}`}>
                            {ch.title ?? `Capítulo ${ch.chapterNumber}`}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {ch.wordCount.toLocaleString("pt-BR")} palavras · ~{Math.max(1, Math.round(ch.wordCount / 200))} min
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isCurrent && <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30 hover:bg-primary/20">Lendo</Badge>}
                          {isRead && !isCurrent && <Badge variant="secondary" className="text-[10px]">Lido</Badge>}
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
