import { createContext, useContext, useMemo, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { apiGet, apiPost } from "../lib/api";

export type User = { email: string; roles: string[]; is_active?: boolean } | null;

// Simple POST helper uses apiPost from lib

export const AuthContext = createContext<{
  user: User;
  authReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<boolean>;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [authReady, setAuthReady] = useState(false);

  // On boot: simply probe /auth/me (cookies set by login or OAuth callback)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await apiGet<User>("/auth/me");
        if (alive) setUser(me);
      } finally {
        if (alive) setAuthReady(true);
      }
    })();
  return () => { alive = false; };
  }, []);

  const login = async (email: string, password: string) => {
    await apiPost("/auth/login", { email, password });
    const me = await apiGet<User>("/auth/me");
    setUser(me);
    setAuthReady(true);
  };

  const register = async (email: string, password: string) => {
    await apiPost("/auth/register", { email, password });
    const me = await apiGet<User>("/auth/me");
    setUser(me);
    setAuthReady(true);
  };

  const logout = async () => {
  try { await apiPost("/auth/logout"); } catch { /* ignore logout errors */ }
    setUser(null);
  };

  const refresh = async (): Promise<boolean> => {
    try {
      await apiPost("/auth/refresh");
      const me = await apiGet<User>("/auth/me");
      setUser(me);
      setAuthReady(true);
      return true;
    } catch {
      return false;
    }
  };

  const value = useMemo(() => ({ user, authReady, login, register, logout, refresh }), [user, authReady]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export function hasRole(user: User, ...roles: string[]) {
  if (!user) return false;
  return user.roles?.some(r => roles.includes(r));
}

// Simple readiness gate: dashboards should render only when a user exists
export function useAuthRequired(): boolean {
  const { user } = useAuth();
  return !!user;
}

// Hook: check if current user has any of the roles
export function useHasRole(...roles: string[]): boolean {
  const { user } = useAuth();
  return !!user?.roles?.some(r => roles.includes(r));
}
