import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft, BookOpen, Heart, BookMarked, User,
  LogIn, LogOut, Loader2, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import {
  useListBooks,
  useGetRecentActivity,
} from "@workspace/api-client-react";

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };

export default function ProfilePage() {
  const { user, isLoading: authLoading, isAuthenticated, login, logout } = useAuth();
  const { data: books } = useListBooks();
  const { data: recent } = useGetRecentActivity();

  const totalBooks = books?.length ?? 0;
  const favoriteCount = books?.filter((b) => b.isFavorite).length ?? 0;
  const inProgress = (recent ?? []).filter((r) => r.currentChapter > 1).length;
  const totalChaptersRead = (recent ?? []).reduce((sum, r) => sum + Math.max(0, (r.currentChapter ?? 1) - 1), 0);
  const totalWords = books?.reduce((sum, b) => sum + b.totalWords, 0) ?? 0;

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Reader"
    : "Reader";

  const initials = user
    ? ([user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "R")
    : "R";

  const stats = [
    { icon: BookOpen,    value: totalBooks,          label: "Books" },
    { icon: Heart,       value: favoriteCount,        label: "Favorites" },
    { icon: TrendingUp,  value: inProgress,           label: "In Progress" },
    { icon: BookMarked,  value: totalChaptersRead,    label: "Ch. Read" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <span className="font-medium text-sm text-foreground">Profile</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 space-y-10">
        {/* Avatar + name */}
        <motion.div
          initial="hidden" animate="show" variants={stagger}
          className="flex flex-col items-center gap-5 text-center"
        >
          <motion.div variants={fadeUp}>
            {authLoading ? (
              <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center">
                <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
              </div>
            ) : user?.profileImageUrl ? (
              <img
                src={user.profileImageUrl}
                alt={displayName}
                className="w-24 h-24 rounded-full object-cover border-2 border-primary/40 shadow-lg shadow-primary/10"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center shadow-lg shadow-primary/10">
                <span className="text-3xl font-bold text-primary">{initials}</span>
              </div>
            )}
          </motion.div>

          <motion.div variants={fadeUp} className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">{displayName}</h1>
            {user?.email && (
              <p className="text-sm text-muted-foreground">{user.email}</p>
            )}
            <p className="text-xs text-muted-foreground font-mono">
              {(totalWords / 1000).toFixed(0)}k words in library
            </p>
          </motion.div>

          <motion.div variants={fadeUp}>
            {isAuthenticated ? (
              <Button variant="outline" size="sm" onClick={logout} className="gap-2">
                <LogOut className="w-3.5 h-3.5" /> Sign Out
              </Button>
            ) : !authLoading ? (
              <Button
                size="sm"
                onClick={login}
                className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <LogIn className="w-3.5 h-3.5" /> Sign In with Replit
              </Button>
            ) : null}
          </motion.div>
        </motion.div>

        <Separator />

        {/* Reading stats */}
        <motion.div initial="hidden" animate="show" variants={stagger}>
          <motion.p variants={fadeUp} className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            Reading Stats
          </motion.p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map(({ icon: Icon, value, label }) => (
              <motion.div
                key={label}
                variants={fadeUp}
                className="bg-card border border-border rounded-xl px-3 py-5 flex flex-col items-center gap-1.5 hover:border-primary/40 transition-colors"
              >
                <Icon className="w-4 h-4 text-primary" />
                <span className="text-2xl font-bold text-foreground tabular-nums">{value}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Auth CTA */}
        {!isAuthenticated && !authLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-secondary/40 border border-border rounded-xl p-6 text-center space-y-3"
          >
            <User className="w-8 h-8 mx-auto text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">Sign in to identify your profile</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your library lives in the database. Sign in with your Replit account to associate a profile name and avatar.
              </p>
            </div>
            <Button size="sm" onClick={login} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
              <LogIn className="w-3.5 h-3.5" /> Sign In with Replit
            </Button>
          </motion.div>
        )}

        {/* Back to library */}
        <div className="pt-4 text-center">
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link href="/">← Back to Library</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
