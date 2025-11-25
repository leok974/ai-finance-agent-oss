// Auth endpoints are exceptions - always use /api/auth/* paths (per Copilot instructions)
// These are the only endpoints that keep the /api/ prefix

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
  const url = `/api/auth/google/login${q}`;
  console.log('[authClient] 🔵 loginWithGoogle called, redirecting to:', url, 'prompt:', prompt);
  window.location.href = url;
}

export function loginWithGitHub() {
  window.location.href = "/api/auth/github/login";
}

export function logout() {
  window.location.href = "/api/auth/google/logout";
}
