// Unified help tooltip fetcher with memory + localStorage cache and ETag awareness.
// Usage: import { getHelp } from '../lib/helpTooltip';

const mem = new Map();
const TTL = 24 * 60 * 60 * 1000; // 24h
const inflight = new Map(); // key -> AbortController

function k(obj) {
  return 'help:' + JSON.stringify(obj);
}

function loadLS(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Date.now() - parsed.t > TTL) return null;
    return parsed.d;
  } catch {
    return null;
  }
}

function saveLS(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data }));
  } catch {
    // ignore quota or serialization errors
  }
}

export async function getHelp({ cardId, mode, month, ctx, baseText }) {
  const key = k({ cardId, mode, month: month || null, ctx, baseText: mode === 'why' ? baseText : null });

  if (mem.has(key)) return { ...mem.get(key), cached: true };
  const ls = loadLS(key);
  if (ls) {
    mem.set(key, ls);
    return { ...ls, cached: true, stale: true };
  }

  // Cancel existing inflight (only keep one latest request per key)
  if (inflight.has(key)) {
    try { inflight.get(key).abort(); } catch { /* noop */ }
    inflight.delete(key);
  }
  const ctrl = new AbortController();
  inflight.set(key, ctrl);

  let etag = mem.get(key)?.etag || ls?.etag;
  const headers = { 'content-type': 'application/json' };
  if (etag) headers['If-None-Match'] = etag;

  try {
    const res = await fetch('/help', {
      method: 'POST',
      headers,
      body: JSON.stringify({ card_id: cardId, mode, month: month || null, deterministic_ctx: ctx, base_text: baseText || null }),
      signal: ctrl.signal,
    });

    if (res.status === 304) {
      // Return memory or storage cached version
      const cached = mem.get(key) || ls;
      if (cached) return { ...cached, cached: true };
      // Edge case: 304 but we lost cache; treat as soft miss -> refetch without ETag
      return await getHelp({ cardId, mode, month, ctx, baseText });
    }

    if (!res.ok) throw new Error('help ' + res.status);
    const data = await res.json();
    data.etag = res.headers.get('ETag') || undefined;
    mem.set(key, data);
    saveLS(key, data);
    return data;
  } catch (err) {
    return { mode, source: 'client-fallback', text: 'Help is temporarily unavailable. Please try again soon.', error: String(err) };
  } finally {
    inflight.delete(key);
  }
}
