import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Send, Loader2, MessageSquare, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useGetBook, useGetReadingProgress, useAskAboutBook } from "@workspace/api-client-react";
import { getGetBookQueryKey, getGetReadingProgressQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

interface QA {
  question: string;
  answer: string;
  upToChapter?: number | null;
}

export default function AskPage({ params }: { params: { id: string } }) {
  const bookId = parseInt(params.id, 10);
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QA[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: book, isLoading: bookLoading } = useGetBook(bookId, {
    query: { enabled: !!bookId, queryKey: getGetBookQueryKey(bookId) },
  });
  const { data: progress } = useGetReadingProgress(bookId, {
    query: { enabled: !!bookId, queryKey: getGetReadingProgressQueryKey(bookId) },
  });

  const ask = useAskAboutBook();

  const upToChapter = progress?.currentChapter ?? undefined;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, ask.isPending]);

  const handleAsk = () => {
    const q = question.trim();
    if (!q || ask.isPending) return;
    setQuestion("");
    ask.mutate(
      { id: bookId, data: { question: q, upToChapter: upToChapter ?? null } },
      {
        onSuccess: (result) => {
          setHistory((prev) => [...prev, { question: result.question, answer: result.answer, upToChapter: result.upToChapter }]);
        },
        onError: () => {
          setHistory((prev) => [...prev, { question: q, answer: "Sorry, I couldn't generate an answer. Please try again." }]);
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border shrink-0">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/book/${bookId}`} data-testid="btn-back">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            {bookLoading ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <>
                <h1 className="font-serif font-semibold text-foreground truncate">{book?.title}</h1>
                {upToChapter && (
                  <p className="text-xs text-muted-foreground">Based on chapters 1–{upToChapter}</p>
                )}
              </>
            )}
          </div>
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/book/${bookId}`}>
              <BookOpen className="w-4 h-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto max-w-2xl w-full mx-auto px-6 py-6 space-y-6">
        {history.length === 0 && !ask.isPending && (
          <div className="text-center pt-12 pb-6 space-y-3">
            <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center mx-auto">
              <MessageSquare className="w-7 h-7 text-accent-foreground" />
            </div>
            <h2 className="font-serif text-xl font-semibold text-foreground">Ask about the story</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Ask anything about the characters, plot, themes, or events from what you've read so far.
              The AI will only answer based on chapters you've read.
            </p>
            <div className="flex flex-col items-center gap-2 pt-4 text-sm text-muted-foreground">
              {[
                "Who is the main character?",
                "What happened in the last chapter?",
                "What is the relationship between X and Y?",
              ].map((hint) => (
                <button
                  key={hint}
                  onClick={() => setQuestion(hint)}
                  className="text-primary/70 hover:text-primary underline underline-offset-2 text-sm transition-colors"
                >
                  "{hint}"
                </button>
              ))}
            </div>
          </div>
        )}

        {history.map((qa, i) => (
          <div key={i} className="space-y-3">
            {/* Question */}
            <div className="flex justify-end">
              <div
                data-testid={`text-question-${i}`}
                className="bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 py-3 max-w-[80%] text-sm leading-relaxed"
              >
                {qa.question}
              </div>
            </div>
            {/* Answer */}
            <div className="flex justify-start">
              <div
                data-testid={`text-answer-${i}`}
                className="bg-card border border-card-border rounded-2xl rounded-tl-md px-4 py-3 max-w-[85%] text-sm leading-relaxed text-foreground"
              >
                <p className="whitespace-pre-wrap">{qa.answer}</p>
                {qa.upToChapter && (
                  <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                    Based on chapters 1–{qa.upToChapter}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Pending question */}
        {ask.isPending && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 py-3 max-w-[80%] text-sm">
                {question || "..."}
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-card border border-card-border rounded-2xl rounded-tl-md px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border shrink-0">
        <div className="max-w-2xl mx-auto px-6 py-4 flex gap-3 items-end">
          <Textarea
            data-testid="textarea-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the story... (Enter to send)"
            className="resize-none min-h-[52px] max-h-32 text-sm flex-1"
            rows={1}
          />
          <Button
            onClick={handleAsk}
            disabled={!question.trim() || ask.isPending}
            size="icon"
            data-testid="btn-send"
            className="shrink-0"
          >
            {ask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
