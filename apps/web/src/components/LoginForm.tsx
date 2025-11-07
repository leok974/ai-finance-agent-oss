import React, { useState } from "react";
import { useAuth } from "@/state/auth";
import { Button } from "@/components/ui/button";
import { ForgotPasswordDialog } from "@/components/ForgotPasswordDialog";

const LoginForm: React.FC = () => {
  const { user, login, register, logout } = useAuth();
  const [email, setEmail] = useState("admin@local");
  const [password, setPassword] = useState("admin");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  if (user) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="opacity-80">{user.email}</span>
  <Button variant="pill-outline" onClick={logout}>Logout</Button>
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
    <>
      <form onSubmit={submit} className="local-auth-form flex items-center gap-2">
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
        <Button variant="pill-primary" type="submit" disabled={loading}>
          {loading ? (mode === "login" ? "…" : "…") : mode === "login" ? "Login" : "Register"}
        </Button>
        <Button type="button" variant="pill-outline" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Register" : "Login"}
        </Button>
        {mode === "login" && (
          <Button type="button" variant="pill-ghost" onClick={() => setShowForgotPassword(true)} className="text-xs">
            Forgot?
          </Button>
        )}
        {error && <span className="text-red-500 text-xs ml-2">{error}</span>}
        {/* OAuth buttons */}
        <div className="flex items-center gap-1 ml-2">
          <Button type="button" variant="pill-outline"
            onClick={() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const base = (import.meta as any)?.env?.VITE_API_BASE || "";
              window.location.href = `${base}/auth/github/start`;
            }}>
            GitHub
          </Button>
          <Button type="button" variant="pill-outline"
            onClick={() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const base = (import.meta as any)?.env?.VITE_API_BASE || "";
              window.location.href = `${base}/auth/google/start`;
            }}>
            Google
          </Button>
        </div>
      </form>
      <ForgotPasswordDialog open={showForgotPassword} onOpenChange={setShowForgotPassword} />
    </>
  );
};

export default LoginForm;
