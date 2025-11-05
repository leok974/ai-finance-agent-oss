// Generic JSON fetcher with graceful 404 fallback to empty object.
// The generic defaults to unknown so callers are nudged to specify a shape.
export async function getJson<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init.headers || {}) } });
  if (res.status === 404) {
    // Treat as no data. Callers can refine shape via generic.
    return {} as T;
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${url}`);
  }
  return res.json() as Promise<T>;
}
