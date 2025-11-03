import { createContext, useContext, useMemo, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { postWithCsrf, getWithAuth } from "../lib/auth-helpers";
import { useDev } from "./dev";

export type User = {
  email: string;
  roles: string[];
  is_active?: boolean;
  dev_unlocked?: boolean;
  env?: string;
} | null;

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

  // On boot: probe /auth/me; if 401, try refresh once, then re-probe
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await getWithAuth<User>("/api/auth/me");
        if (alive) setUser(me);
      } catch (firstErr) {
        // If 401, attempt a silent refresh
        const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        if (/^HTTP 401/.test(msg)) {
          try {
            await postWithCsrf("/api/auth/refresh", {});
            const me = await getWithAuth<User>("/api/auth/me");
            if (alive) setUser(me);
          } catch (refreshErr) {
            // Refresh failed or still 401 - user not logged in
            if (alive) setUser(null);
          }
        } else {
          // eslint-disable-next-line no-console
          console.error("Auth bootstrap failed", firstErr);
          if (alive) setUser(null);
        }
      } finally {
        if (alive) setAuthReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const login = async (email: string, password: string) => {
    await postWithCsrf("/api/auth/login", { email, password });
    const me = await getWithAuth<User>("/api/auth/me");
    setUser(me);
    setAuthReady(true);
  };

  const register = async (email: string, password: string) => {
    await postWithCsrf("/api/auth/register", { email, password });
    const me = await getWithAuth<User>("/api/auth/me");
    setUser(me);
    setAuthReady(true);
  };

  const logout = async () => {
    try { await postWithCsrf("/api/auth/logout", {}); } catch { /* ignore logout errors */ }
    setUser(null);
  };

  const refresh = async (): Promise<boolean> => {
    try {
      await postWithCsrf("/api/auth/refresh", {});
      const me = await getWithAuth<User>("/api/auth/me");
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

// Hook: check if current user is admin
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  return !!user?.roles?.includes("admin");
}

// Hook: check if dev mode is unlocked (client-side session state)
export function useDevUnlocked(): boolean {
  const { isUnlocked } = useDev();
  return isUnlocked;
}

// Hook: check if current user should see dev tools (admin + unlocked + dev env)
export function useShowDevTools(): boolean {
  const { user } = useAuth();
  const { isUnlocked } = useDev();
  const isAdmin = !!user?.roles?.includes("admin");
  const isDevEnv = user?.env === "dev";
  return isAdmin && isUnlocked && isDevEnv;
}
