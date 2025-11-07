const API_BASE = import.meta.env.VITE_API_BASE || "";
const API = API_BASE ? API_BASE.replace(/\/$/, "") : "";

export type GooglePrompt =
  | "auto"                // default: no prompt param
  | "select_account"
  | "consent select_account"
  | "login";

/**
 * Initiates Google OAuth login flow with optional prompt parameter
 * @param prompt - Controls Google's account selection/consent behavior
 */
export function loginWithGoogle(prompt: GooglePrompt = "auto") {
  const q = prompt === "auto" ? "" : `?prompt=${encodeURIComponent(prompt)}`;
  const url = `${API}/api/auth/google/login${q}`;
  console.log('[authClient] 🔵 loginWithGoogle called, redirecting to:', url, 'prompt:', prompt);
  window.location.href = url;
}

export function loginWithGitHub() {
  window.location.href = `${API}/api/auth/github/login`;
}

export function logout() {
  window.location.href = `${API}/api/auth/google/logout`;
}
