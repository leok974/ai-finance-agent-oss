/**
 * Resolve the agent chat endpoint path.
 * 
 * Priority:
 * 1. Explicit override via window.__CHAT_AGENT_PATH__
 * 2. API base + /agent/chat (e.g., /api/agent/chat for nginx passthrough)
 * 3. Fallback to /agent/chat
 */
export function resolveAgentPath(): string {
  // Explicit override for testing or custom deployments
  const override = (window as any).__CHAT_AGENT_PATH__ as string | undefined;
  if (override) return override;

  // Use API base if configured (e.g., /api for nginx passthrough)
  const apiBase = (window as any).__API_BASE__ ?? '/api';
  return `${apiBase.replace(/\/$/, '')}/agent/chat`;
}
