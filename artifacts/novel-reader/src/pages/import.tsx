import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Upload, FileText, Plus, X } from "lucide-react";
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

  const createBook = useCreateBook();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setContent(text);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
      }
    };
    reader.readAsText(file);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  };

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

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
          toast({ title: "Novel imported!", description: `"${book.title}" has been added to your library.` });
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
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/" data-testid="btn-back">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <h1 className="font-serif text-xl font-semibold">Import Novel</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium">Title *</Label>
            <Input
              id="title"
              data-testid="input-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Novel title"
              required
            />
          </div>

          {/* Author */}
          <div className="space-y-2">
            <Label htmlFor="author" className="text-sm font-medium">Author</Label>
            <Input
              id="author"
              data-testid="input-author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author name (optional)"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tags</Label>
            <div className="flex gap-2">
              <Input
                data-testid="input-tag"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Add a tag (e.g. fantasy, romance)"
              />
              <Button type="button" variant="outline" onClick={addTag} data-testid="btn-add-tag">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                    {t}
                    <button type="button" onClick={() => removeTag(t)} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Upload File</Label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              data-testid="btn-upload"
              className="w-full border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 hover:bg-accent/30 transition-all group cursor-pointer"
            >
              <Upload className="w-8 h-8 mx-auto text-muted-foreground group-hover:text-primary transition-colors mb-3" />
              <p className="text-sm font-medium text-foreground">Click to upload a .txt file</p>
              <p className="text-xs text-muted-foreground mt-1">Plain text files only</p>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={handleFile}
              data-testid="input-file"
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="content" className="text-sm font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Paste Text *
              </Label>
              {wordCount > 0 && (
                <span className="text-xs text-muted-foreground" data-testid="text-wordcount">
                  {wordCount.toLocaleString()} words
                </span>
              )}
            </div>
            <Textarea
              id="content"
              data-testid="textarea-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste your novel text here. The app will automatically detect and parse chapters."
              className="min-h-48 font-mono text-sm resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Chapters are auto-detected from headers like "Chapter 1", "CHAPTER 1", etc.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" asChild>
              <Link href="/">Cancel</Link>
            </Button>
            <Button
              type="submit"
              disabled={createBook.isPending || !title.trim() || !content.trim()}
              data-testid="btn-submit-import"
            >
              {createBook.isPending ? "Importing..." : "Import Novel"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
