import React, { useState } from "react";
import { useAuth } from "@/state/auth";

const LoginForm: React.FC = () => {
  const { user, login, register, logout } = useAuth();
  const [email, setEmail] = useState("admin@local");
  const [password, setPassword] = useState("admin");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    </form>
  );
};

export default LoginForm;
