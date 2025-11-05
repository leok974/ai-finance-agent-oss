// Lightweight, CSP-safe analytics emitter.
// Posts to our own backend; no third-party origins required.
// Enabled if VITE_ANALYTICS_ENABLED=1 or in production build (PROD true) for self-host metrics.

export type AnalyticsProps = Record<string, unknown>;

// Narrow import.meta typing defensively without using 'any'
interface ImportMetaMaybe {
  env?: Record<string, unknown> & { VITE_ANALYTICS_ENABLED?: string; PROD?: boolean; VITE_ANALYTICS_SAMPLE_PCT?: string; VITE_ANALYTICS_FORCE?: string };
}
// Cast carefully (Vite supplies import.meta.env); fallback disabled if absent
const meta: ImportMetaMaybe = (import.meta as unknown) as ImportMetaMaybe;
const ENABLED = meta?.env?.VITE_ANALYTICS_ENABLED === '1' || meta?.env?.PROD === true;
const SAMPLE_PCT_RAW = meta?.env?.VITE_ANALYTICS_SAMPLE_PCT;
let SAMPLE_PCT = 100;
if (typeof SAMPLE_PCT_RAW === 'string') {
  const n = Number(SAMPLE_PCT_RAW);
  if (!Number.isNaN(n) && n >= 0 && n <= 100) SAMPLE_PCT = n;
}
const FORCE = meta?.env?.VITE_ANALYTICS_FORCE === '1';
const sampledIn = () => {
  if (FORCE) return true;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('forceAnalytics') === '1') return true;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return true;
  } catch { /* ignore */ }
  return SAMPLE_PCT >= 100 ? true : Math.random() * 100 < SAMPLE_PCT;
};

// Primary modern path (agent tools namespace) and legacy fallback (/api/), only used if primary 404s.
const PRIMARY_PATH = '/agent/analytics/event';
const LEGACY_PATH = '/api/analytics/event'; // compat, if present

function buildUrl(path: string): string {
  try {
    return new URL(path, window.location.origin).toString();
  } catch {
    return path;
  }
}

export function track(event: string, props?: AnalyticsProps): void {
  if (!ENABLED || !sampledIn()) return;
  const payload = {
    event,
    ts: Date.now(),
    props: {
      ...props,
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    },
  };

  // Prefer sendBeacon for durability on navigations
  try {
    const url = buildUrl(PRIMARY_PATH);
    const body = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    if (navigator?.sendBeacon && navigator.sendBeacon(url, body)) return;
  } catch {
    /* swallow; fallback to fetch below */
  }

  // Fallback to fetch; try legacy path on 404
  try {
    fetch(PRIMARY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).then((r) => {
      if (r.status === 404) {
        return fetch(LEGACY_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {});
      }
      return undefined;
    }).catch(() => {});
  } catch {
    /* no-op */
  }
}

export async function trackTimed<T>(name: string, props: AnalyticsProps | undefined, fn: () => Promise<T>): Promise<T> {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  try {
    const result = await fn();
    const dur = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
    track(`${name}_ms`, { ...props, duration_ms: dur });
    return result;
  } catch (err) {
    const dur = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message?: unknown }).message) : String(err);
  track(`${name}_error`, { ...props, duration_ms: dur, message: msg });
    throw err;
  }
}

export default { track, trackTimed };
