// Centralized HTTP helpers with Vite proxy support.
// In dev: VITE_API_BASE=/api, Vite proxy strips /api and forwards to backend.
// In prod: VITE_API_BASE=/ (or empty), nginx routes directly.
// All API calls use relative paths; http.ts adds the base prefix.

interface ViteEnv {
  VITE_API_BASE?: string;
  VITE_AUTH_API_BASE?: string;
}
// Narrow import.meta typing without broad any usage
const env = (import.meta as unknown as { env?: ViteEnv })?.env || {};

// API base for all non-auth endpoints (e.g., /api in dev, / in prod)
// Default to '/' for production (nginx routes without /api prefix)
export const BASE = (env.VITE_API_BASE ?? '/').replace(/\/$/, '');

// Auth endpoints (e.g., /api/auth in dev, /api/auth in prod)
const AUTH_BASE = env.VITE_AUTH_API_BASE || '/api';

// Paths that pass through without BASE prefix (already absolute with /api or external)
function shouldBypassPrefix(path: string) {
  if (!path) return false;
  // External URLs untouched
  if (/^https?:\/\//i.test(path)) return true;
  // Already explicitly under /api/auth or /api/
  if (path.startsWith("/api/")) return true;
  return false;
}

function join(base: string, path: string) {
  return `${base.replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}
function withQuery(url: string, qs?: Record<string, string | number | boolean>) {
  if (!qs) return url;
  const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, String(v));
  return u.pathname + (u.search || "");
}

export type FetchOpts = RequestInit & { query?: Record<string, string | number | boolean> };

export async function fetchJSON<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  // Normalize to absolute
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const baseApplied = shouldBypassPrefix(normalized) ? normalized : join(BASE, normalized);
  const url = withQuery(baseApplied, opts.query);

  // Build headers: default to JSON, but DO NOT force Content-Type for FormData or non-JSON bodies
  const hdrs = new Headers(opts.headers || {});
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  if (!isForm && !hdrs.has('Content-Type')) hdrs.set('Content-Type', 'application/json');

  // E2E test mode: add x-test-mode header for deterministic responses
  if (typeof window !== 'undefined' && (window as any).__E2E_TEST__ && url.includes('/agent/chat')) {
    hdrs.set('x-test-mode', 'stub');
  }

  const r = await fetch(url, {
    credentials: 'same-origin',
    headers: hdrs,
    method: opts.method ?? 'GET',
    body: opts.body,
    cache: 'no-store',
  });
  if (!r.ok) {
    // Try to extract error message from response body
    let errorMsg = `HTTP ${r.status} ${url}`;
    try {
      const errorData = await r.json();
      if (errorData && typeof errorData === 'object' && 'message' in errorData) {
        errorMsg = String(errorData.message);
      }
    } catch {
      // If JSON parsing fails, use default error message
    }
    throw new Error(errorMsg);
  }
  return (await r.json()) as T;
}

// Auth endpoints stay under /api/auth/* (path argument should begin with /auth)
export async function fetchAuth<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const url = withQuery(join(AUTH_BASE, path), opts.query);
  const r = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    method: opts.method ?? 'GET',
    body: opts.body,
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`AUTH ${r.status} ${r.statusText} ${url}`);
  return (await r.json()) as T;
}

// Utility: chart slug normalization (shared usage)
export const dashSlug = (s: string) => s.replace(/_/g, '-');

// Raw HTTP helper for non-JSON responses (e.g., downloads, streaming)
export async function http(path: string, opts: FetchOpts = {}): Promise<Response> {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const baseApplied = shouldBypassPrefix(normalized) ? normalized : join(BASE, normalized);
  const url = withQuery(baseApplied, opts.query);

  const r = await fetch(url, {
    credentials: 'same-origin',
    method: opts.method ?? 'GET',
    ...opts,
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} ${url}`);
  return r;
}
