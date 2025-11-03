export const isCI = !!process.env.CI;
export const isDevMode = (process.env.USE_DEV ?? '1') !== '0';
export const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5173';

export function joinUrl(base: string, path: string): string {
  const u = new URL(base);
  const p = path.startsWith('/') ? path : `/${path}`;
  u.pathname = (u.pathname.replace(/\/+$/, '') || '') + p;
  return u.toString();
}

export function apiRoot(): string {
  if (isDevMode) {
    const p = process.env.BACKEND_PORT || '8000';
    return `http://127.0.0.1:${p}`;
  }
  const edge = process.env.API_BASE || process.env.EDGE_BASE || 'http://127.0.0.1:8080';
  return edge.replace(/\/+$/, '');
}

export function apiBase(): string {
  return `${apiRoot()}/api`;
}

export function authBase(): string {
  return `${apiRoot()}/auth`;
}

export function ingestUrl(): string {
  return `${apiRoot()}/ingest`;
}

export function isEdgeLike(): boolean {
  return !isDevMode;
}
