/**
 * Centralized API paths for E2E tests
 *
 * Single source of truth to avoid path chase across test files.
 */

// Agent chat endpoint - supports both /api/agent/chat (legacy) and /agent/chat (prod)
// Override with AGENT_PATH env var if needed
export const AGENT_CHAT_PATH = process.env.AGENT_PATH ?? '/api/agent/chat';

// Auth endpoints (always under /api/auth)
export const AUTH_LOGIN_PATH = '/api/auth/login';
export const AUTH_REGISTER_PATH = '/api/auth/register';
export const AUTH_REFRESH_PATH = '/api/auth/refresh';
export const AUTH_ME_PATH = '/api/auth/me';

// Health endpoints
export const HEALTH_PATH = '/api/healthz';
export const READY_PATH = '/api/ready';

/**
 * Build full URL for agent chat endpoint
 */
export function getAgentChatUrl(baseUrl: string): string {
  return `${baseUrl}${AGENT_CHAT_PATH}`;
}

/**
 * Build full URL for auth endpoint
 */
export function getAuthUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}
