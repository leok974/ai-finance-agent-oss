import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import { getAccessToken, getRefreshToken, http as httpApi, setAuthTokens, clearAuthTokens, setAccessToken, apiGet } from "../lib/api";
import { readHashTokens } from "@/utils/hashTokens";

export type User = { email: string; roles: string[]; is_active?: boolean } | null;

// HTTP helpers specific to auth endpoints
async function post<T=any>(path: string, body: any): Promise<T> {
  return httpApi<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export const AuthContext = createContext<{
  user: User;
  authReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<boolean>;
} | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>(null);
  const [authReady, setAuthReady] = useState(false);

  // One-time bootstrap: capture hash tokens (OAuth), or use stored tokens, then probe /auth/me.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // 1) OAuth redirect tokens in the URL hash
        const ht = readHashTokens();
        if (ht?.access) {
          setAccessToken(ht.access);
          if (ht.refresh) sessionStorage.setItem("refresh_token", ht.refresh);
        }

        // 2) If we have any token (from hash or storage), try /auth/me
        if (getAccessToken() || getRefreshToken()) {
          try {
            const me = await httpApi<User>("/auth/me");
            if (alive) setUser(me);
          } catch {
            // ignore; allows dev-bypass or fresh login later
          }
        } else {
          // 3) Even with no token, /auth/me may work in dev bypass
          try {
            const me = await httpApi<User>("/auth/me");
            if (alive) setUser(me);
          } catch { /* ignore */ }
        }
      } finally {
        if (alive) setAuthReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await post<{ access_token: string; refresh_token: string }>("/auth/login", { email, password });
    const accessToken = (res as any).access_token || (res as any).accessToken;
    const refreshToken = (res as any).refresh_token || (res as any).refreshToken;
    setAuthTokens({ accessToken, refreshToken });
    const me = await httpApi<User>("/auth/me");
    setUser(me);
  setAuthReady(true);
  };

  const register = async (email: string, password: string) => {
    const res = await post<{ access_token: string; refresh_token: string }>("/auth/register", { email, password });
    const accessToken = (res as any).access_token || (res as any).accessToken;
    const refreshToken = (res as any).refresh_token || (res as any).refreshToken;
    setAuthTokens({ accessToken, refreshToken });
    const me = await httpApi<User>("/auth/me");
    setUser(me);
  setAuthReady(true);
  };

  const logout = () => {
    clearAuthTokens();
    setUser(null);
  };

  const refresh = async (): Promise<boolean> => {
    try {
      const rt = getRefreshToken();
      if (!rt) return false;
      const res = await post<{ access_token: string; refresh_token?: string }>("/auth/refresh", { token: rt });
      const accessToken = (res as any).access_token || (res as any).accessToken;
      const refreshToken = (res as any).refresh_token || (res as any).refreshToken || rt;
      if (!accessToken) return false;
      setAuthTokens({ accessToken, refreshToken });
      const me = await httpApi<User>("/auth/me");
      setUser(me);
    setAuthReady(true);
      return true;
    } catch {
      return false;
    }
  };

  const value = useMemo(() => ({ user, authReady, login, register, logout, refresh }), [user, authReady]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
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
