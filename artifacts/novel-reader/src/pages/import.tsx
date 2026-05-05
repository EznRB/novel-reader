import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Upload, FileText, Plus, X, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useCreateBook, getListBooksQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function ImportPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsingEpub, setParsingEpub] = useState(false);

  const createBook = useCreateBook();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "epub") {
      setParsingEpub(true);
      try {
        const formData = new FormData();
        formData.append("epub", file);
        const resp = await fetch("/api/books/import-epub", { method: "POST", body: formData });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? "Failed to parse EPUB");
        }
        const data = (await resp.json()) as { title: string; author: string; content: string };
        setContent(data.content);
        if (!title && data.title) setTitle(data.title);
        if (!author && data.author) setAuthor(data.author);
        toast({ title: "EPUB parsed!", description: `Extracted ${data.content.trim().split(/\s+/).length.toLocaleString()} words.` });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "EPUB parsing failed";
        toast({ title: "EPUB error", description: msg, variant: "destructive" });
        setFileName(null);
      } finally {
        setParsingEpub(false);
      }
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setContent(text);
        if (!title) setTitle(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
      };
      reader.readAsText(file);
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast({ title: "Missing fields", description: "Title and content are required.", variant: "destructive" });
      return;
    }
    createBook.mutate(
      { data: { title: title.trim(), author: author.trim() || undefined, content: content.trim(), tags } },
      {
        onSuccess: (book) => {
          queryClient.invalidateQueries({ queryKey: getListBooksQueryKey() });
          toast({ title: "Imported!", description: `"${book.title}" added to your library.` });
          setLocation(`/book/${book.id}`);
        },
        onError: () => {
          toast({ title: "Import failed", description: "Something went wrong. Please try again.", variant: "destructive" });
        },
      }
    );
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/" data-testid="btn-back"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            <h1 className="font-semibold text-foreground">Import Novel</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title + Author */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="title" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title *</Label>
              <Input
                id="title"
                data-testid="input-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Novel title"
                className="bg-secondary border-border"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="author" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Author</Label>
              <Input
                id="author"
                data-testid="input-author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Author name"
                className="bg-secondary border-border"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tags</Label>
            <div className="flex gap-2">
              <Input
                data-testid="input-tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="fantasy, romance, sci-fi…"
                className="bg-secondary border-border text-sm"
              />
              <Button type="button" variant="outline" size="icon" onClick={addTag} data-testid="btn-add-tag">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 text-xs">
                    {t}
                    <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}>
                      <X className="w-3 h-3 hover:text-destructive" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* File upload */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Upload .epub or .txt File</Label>
            <button
              type="button"
              onClick={() => !parsingEpub && fileRef.current?.click()}
              data-testid="btn-upload"
              disabled={parsingEpub}
              className={`w-full border-2 border-dashed rounded-xl p-8 text-center transition-all group cursor-pointer
                ${fileName && !parsingEpub ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-secondary/40"}
                ${parsingEpub ? "opacity-70 cursor-wait" : ""}`}
            >
              {parsingEpub ? (
                <div className="flex items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">Parsing EPUB…</p>
                    <p className="text-xs text-muted-foreground">Extracting chapters and text</p>
                  </div>
                </div>
              ) : fileName ? (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="w-6 h-6 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">{fileName}</p>
                    <p className="text-xs text-muted-foreground">{wordCount.toLocaleString()} words loaded</p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                  <p className="text-sm font-medium text-foreground">Click to upload a file</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports .epub and .txt</p>
                </>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".epub,.txt,text/plain,application/epub+zip"
              className="hidden"
              onChange={handleFile}
              data-testid="input-file"
            />
          </div>

          {/* Paste content */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="content" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Or Paste Text *
              </Label>
              {wordCount > 0 && (
                <span className="text-xs text-muted-foreground font-mono" data-testid="text-wordcount">
                  {wordCount.toLocaleString()} words
                </span>
              )}
            </div>
            <Textarea
              id="content"
              data-testid="textarea-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Paste your novel text here.\n\nChapters are auto-detected from headings like:\n  Chapter 1, CHAPTER 1, 1. Title…`}
              className="min-h-52 font-mono text-xs bg-secondary border-border resize-y"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" asChild>
              <Link href="/">Cancel</Link>
            </Button>
            <Button
              type="submit"
              disabled={createBook.isPending || parsingEpub || !title.trim() || !content.trim()}
              className="bg-primary hover:bg-primary/90"
              data-testid="btn-submit-import"
            >
              {createBook.isPending ? "Importing…" : "Import Novel"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
