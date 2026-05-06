import { useState, useEffect, useCallback } from "react";

export interface AuthUser {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const BASE = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE}/api/auth/user`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: { user: AuthUser | null }) => {
        if (!cancelled) {
          setUser(data.user ?? null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [BASE]);

  const login = useCallback(() => {
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `${BASE}/api/login?returnTo=${returnTo}`;
  }, [BASE]);

  const logout = useCallback(() => {
    window.location.href = `${BASE}/api/logout`;
  }, [BASE]);

  return { user, isLoading, isAuthenticated: !!user, login, logout };
}
