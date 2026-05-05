import { Link } from "wouter";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
      <BookOpen className="w-12 h-12 text-muted-foreground" />
      <h1 className="text-2xl font-serif font-semibold">Page not found</h1>
      <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
      <Button asChild>
        <Link href="/">Go to Library</Link>
      </Button>
    </div>
  );
}
