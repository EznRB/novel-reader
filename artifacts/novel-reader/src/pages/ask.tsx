import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Send, Loader2, Sparkles, BookOpen, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGetBook, useGetReadingProgress, useAskAboutBook } from "@workspace/api-client-react";
import { getGetBookQueryKey, getGetReadingProgressQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

interface QA { question: string; answer: string; upToChapter?: number | null }

const HINTS = [
  "Who is the main character?",
  "What happened in the last chapter?",
  "What is the relationship between the main characters?",
  "What is the central conflict of the story?",
];

export default function AskPage({ params }: { params: { id: string } }) {
  const bookId = parseInt(params.id, 10);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QA[]>([]);
  const [pendingQ, setPendingQ] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: book, isLoading } = useGetBook(bookId, {
    query: { enabled: !!bookId, queryKey: getGetBookQueryKey(bookId) },
  });
  const { data: progress } = useGetReadingProgress(bookId, {
    query: { enabled: !!bookId, queryKey: getGetReadingProgressQueryKey(bookId) },
  });

  const ask = useAskAboutBook();
  const upToChapter = progress?.currentChapter;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, pendingQ]);

  const handleAsk = () => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setPendingQ(q);
    setQuestion("");
    ask.mutate(
      { id: bookId, data: { question: q, upToChapter: upToChapter ?? null } },
      {
        onSuccess: (result) => {
          setHistory((prev) => [...prev, { question: result.question, answer: result.answer, upToChapter: result.upToChapter }]);
          setPendingQ(null);
        },
        onError: () => {
          setHistory((prev) => [...prev, { question: q, answer: "Sorry, I couldn't generate an answer. Please try again." }]);
          setPendingQ(null);
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border shrink-0">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href={`/book/${bookId}`} data-testid="btn-back"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <Skeleton className="h-4 w-36" />
            ) : (
              <>
                <p className="text-sm font-medium text-foreground truncate">{book?.title}</p>
                {upToChapter && (
                  <p className="text-xs text-muted-foreground">Spoiler-safe up to Ch.{upToChapter}</p>
                )}
              </>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href={`/book/${bookId}`}><BookOpen className="w-4 h-4" /></Link>
          </Button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto max-w-2xl w-full mx-auto px-4 py-6 space-y-5">
        {history.length === 0 && !pendingQ && (
          <div className="text-center pt-10 pb-6 space-y-4">
            <div className="w-14 h-14 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mx-auto">
              <Sparkles className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-semibold text-foreground">Ask AI about the story</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Questions are answered based only on what you've read — no spoilers.
              </p>
            </div>
            <div className="flex flex-col items-center gap-2 pt-2">
              {HINTS.map((hint) => (
                <button
                  key={hint}
                  onClick={() => setQuestion(hint)}
                  className="text-sm text-primary/80 hover:text-primary underline underline-offset-2 transition-colors"
                >
                  "{hint}"
                </button>
              ))}
            </div>
          </div>
        )}

        {history.map((qa, i) => (
          <div key={i} className="space-y-3">
            <div className="flex justify-end">
              <div
                data-testid={`text-question-${i}`}
                className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm leading-relaxed"
              >
                {qa.question}
              </div>
            </div>
            <div className="flex justify-start gap-2 items-start">
              <div className="w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
              <div
                data-testid={`text-answer-${i}`}
                className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 max-w-[82%] text-sm leading-relaxed text-foreground"
              >
                <p className="whitespace-pre-wrap">{qa.answer}</p>
                {qa.upToChapter && (
                  <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border font-mono">
                    Based on chapters 1–{qa.upToChapter}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}

        {pendingQ && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm">
                {pendingQ}
              </div>
            </div>
            <div className="flex justify-start gap-2 items-start">
              <div className="w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <div className="sticky bottom-0 bg-background/90 backdrop-blur-md border-t border-border shrink-0">
        <div className="max-w-2xl mx-auto px-4 py-3 flex gap-2 items-end">
          <Textarea
            data-testid="textarea-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the story… (Enter to send)"
            className="resize-none min-h-[44px] max-h-32 text-sm flex-1 bg-secondary border-border"
            rows={1}
          />
          <Button
            onClick={handleAsk}
            disabled={!question.trim() || ask.isPending}
            size="icon"
            data-testid="btn-send"
            className="shrink-0 bg-primary hover:bg-primary/90 h-10 w-10"
          >
            {ask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
