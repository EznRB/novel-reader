import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import LibraryPage from "@/pages/library";
import BookDetailPage from "@/pages/book-detail";
import ReaderPage from "@/pages/reader";
import ImportPage from "@/pages/import";
import AskPage from "@/pages/ask";
import ProfilePage from "@/pages/profile";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={LibraryPage} />
      <Route path="/import" component={ImportPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/book/:id" component={BookDetailPage} />
      <Route path="/book/:id/ask" component={AskPage} />
      <Route path="/read/:id/chapter/:num" component={ReaderPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
