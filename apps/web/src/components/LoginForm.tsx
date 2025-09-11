import React, { useState } from "react";
import { useAuth } from "@/state/auth";

const LoginForm: React.FC = () => {
  const { user, login, register, logout } = useAuth();
  const [email, setEmail] = useState("admin@local");
  const [password, setPassword] = useState("admin");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const DEMO_EMAIL = (import.meta as any).env?.VITE_DEMO_LOGIN_EMAIL ?? "admin@local";
  const DEMO_PASS = (import.meta as any).env?.VITE_DEMO_LOGIN_PASSWORD ?? "admin123";
  const DEMO_MODE = (import.meta as any).env?.VITE_DEMO_MODE ?? "0";
  const DEMO_TOKEN = (import.meta as any).env?.VITE_DEMO_LOGIN_TOKEN ?? "";

  if (user) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="opacity-80">{user.email}</span>
        <button className="btn btn-ghost btn-xs" onClick={logout}>Logout</button>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const trimmed = email.trim();
      if (mode === "login") await login(trimmed, password);
      else await register(trimmed, password);
    } catch (e: any) {
      // show friendly message for auth failures
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        type="email"
        className="input input-bordered input-xs"
        placeholder="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        className="input input-bordered input-xs"
        placeholder="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="btn btn-primary btn-xs" type="submit" disabled={loading}>
        {loading ? (mode === "login" ? "…" : "…") : mode === "login" ? "Login" : "Register"}
      </button>
      <button type="button" className="btn btn-ghost btn-xs" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Register" : "Login"}
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-xs"
        onClick={() => {
          setEmail(DEMO_EMAIL);
          setPassword(DEMO_PASS);
          // auto-submit with demo creds
          setTimeout(() => {
            const evt = new Event('submit', { bubbles: true, cancelable: true });
            (document.activeElement as HTMLElement)?.blur?.();
            (document.querySelector('form') as HTMLFormElement)?.dispatchEvent?.(evt);
          }, 0);
        }}
      >
        Use demo credentials
      </button>
      {error && <span className="text-red-500 text-xs ml-2">{error}</span>}
      {/* OAuth buttons */}
      <div className="flex items-center gap-1 ml-2">
        <button type="button" className="btn btn-ghost btn-xs"
          onClick={() => {
            const base = (import.meta as any)?.env?.VITE_API_BASE || "";
            window.location.href = `${base}/auth/github/start`;
          }}>
          GitHub
        </button>
        <button type="button" className="btn btn-ghost btn-xs"
          onClick={() => {
            const base = (import.meta as any)?.env?.VITE_API_BASE || "";
            window.location.href = `${base}/auth/google/start`;
          }}>
          Google
        </button>
      </div>
      {String(DEMO_MODE) === "1" && DEMO_TOKEN && (
        <a
          className="text-xs underline ml-2"
          href={`${(import.meta as any)?.env?.VITE_API_BASE || ""}/auth/demo_login?token=${encodeURIComponent(DEMO_TOKEN)}`}
        >
          Having trouble? One-click login
        </a>
      )}
    </form>
  );
};

export default LoginForm;
