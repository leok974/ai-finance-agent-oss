export function readHashTokens(): { access?: string; refresh?: string } | null {
  const h = window.location.hash?.replace(/^#/, "");
  if (!h) return null;
  const params = new URLSearchParams(h);
  const access = params.get("access_token") || undefined;
  const refresh = params.get("refresh_token") || undefined;
  if (!access && !refresh) return null;
  // Clean hash so it doesn't linger in history
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return { access, refresh };
}
