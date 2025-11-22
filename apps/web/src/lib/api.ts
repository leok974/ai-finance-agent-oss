import type { RuleSuggestion as MinedRuleSuggestionStrict } from "@/types/rules";
import { isRuleSuggestionArray } from "@/types/rules";
import { fetchJSON } from '@/lib/http';
import { FEATURES } from '@/config/featureFlags';
import { useDev } from '@/state/dev';
import type {
  AgentChatResponse as TypedAgentChatResponse,
  AgentStatusResponse as TypedAgentStatusResponse,
  WhatIfParams,
  WhatIfResult,
  AgentPlanStatus,
  Transaction,
  RuleSaveResponse,
  ExplainSignalData,
  MLStatusResponse,
} from '@/types/agent';

// Resolve API base from env, with a dev fallback when running Vite on port 5173
const rawApiBase = (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE;
// Allow empty string for production (where nginx handles /api/ routing)
export const API_BASE = rawApiBase !== undefined
  ? (rawApiBase as string).replace(/\/+$/, '')
  : '/api';

// ============================================================================
// Runtime guards (keeps UI stable with malformed backend responses)
// ============================================================================

/** Safe array coercion: returns empty array if input is not array-like */
const arr = <T>(x: unknown): T[] => Array.isArray(x) ? x as T[] : [];

/** Safe number coercion: returns 0 if NaN */
const num = (x: unknown): number => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

// Small helper: inject `model` if override is set
function withModel<T extends Record<string, unknown>>(body: T): T {
  const m = useDev.getState().modelOverride;
  return m ? ({ ...body, model: m } as T) : body;
}

function cookieGet(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : null;
  } catch {
    return null;
  }
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const url = apiUrl(path);
  const method = (options.method || "GET").toString().toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !["GET", "HEAD"].includes(method)) {
    headers.set("Content-Type", "application/json");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = cookieGet("csrf_token");
    if (csrf && !headers.has("X-CSRF-Token")) headers.set("X-CSRF-Token", csrf);
  }
  const res = await fetch(url, { credentials: "include", ...options, headers });
  if (res.status === 204) return null as T;
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} :: ${text || "<empty>"}`);
  try {
    return text ? (JSON.parse(text) as T) : (null as T);
  } catch {
    return text as unknown as T;
  }
}

// Charts: migrated to /agent/tools/charts/* POST endpoints (legacy /charts/* removed backend-side)
// Helper: generate an array of YYYY-MM strings going backwards from an anchor month (inclusive)
function monthsBack(anchor: string, count: number): string[] {
  if (!/^[0-9]{4}-[0-9]{2}$/.test(anchor)) return [];
  const [y0, m0] = anchor.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(y0, m0 - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out.reverse(); // chronological ascending
}

// Resolve latest month directly from new meta endpoint
export async function resolveMonth(): Promise<string> {
  // Canonical POST; server still provides GET compat temporarily
  try {
    const r: { month?: string; latest_month?: string } = await fetchJSON('/agent/tools/meta/latest_month', { method: 'POST', body: JSON.stringify({}) });
    return r?.month ?? r?.latest_month ?? '';
  } catch { return ''; }
}
export const resolveMonthFromCharts = resolveMonth; // alias for backward references

// Optional bearer fallback: keep a transient token if needed (e.g., dev/testing)
let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };

function withCreds(init: RequestInit = {}): RequestInit {
  // Preserve headers and include cookies in all requests
  const headers = new Headers(init.headers || {});
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  // CSRF: include header for unsafe methods if cookie is present
  const method = (init.method || 'GET').toString().toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    try {
      const m = typeof document !== 'undefined' ? document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/) : null;
      const csrf = m && m[1] ? decodeURIComponent(m[1]) : undefined;
      if (csrf && !headers.has("X-CSRF-Token")) headers.set("X-CSRF-Token", csrf);
    } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
  }
  return { ...init, headers, credentials: "include" };
}

function withAuthHeaders(headers?: HeadersInit): HeadersInit {
  const at = accessToken;
  if (!at) return headers || {};
  const base: Record<string, string> = {};
  if (headers) {
    if (headers instanceof Headers) {
      headers.forEach((v, k) => (base[k] = v));
    } else if (Array.isArray(headers)) {
      for (const [k, v] of headers) base[k] = String(v);
    } else {
      Object.assign(base, headers as Record<string, string>);
    }
  }
  base["Authorization"] = `Bearer ${at}`;
  return base;
}

const RATE_LIMIT_MAX_RETRIES = 4;
const RATE_LIMIT_BACKOFF_BASE_MS = 500;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------
// Global fetch guards
// ---------------------------
// Note: These utilities are currently unused but kept for potential future rate limiting
// type CacheEntry = { t: number; p: Promise<unknown> };
// const CACHE_TTL_MS = 5000; // 5s shared cache across panels
// const responseCache = new Map<string, CacheEntry>();
// const inflight = new Map<string, Promise<unknown>>();

// Simple request limiter (queue) to prevent stampedes
// const MAX_CONCURRENCY = 4;
// let active = 0;
// const reqQueue: Array<() => void> = [];
// function runOrQueue(fn: () => void) {
//   if (active < MAX_CONCURRENCY) {
//     active++;
//     fn();
//   } else {
//     reqQueue.push(fn);
//   }
// }
// function done() {
//   active = Math.max(0, active - 1);
//   const next = reqQueue.shift();
//   if (next) {
//     active++;
//     next();
//   }
// }

// function keyFromInit(url: string, init?: RequestInit) {
//   const method = (init?.method || "GET").toUpperCase();
//   const body = typeof init?.body === "string" ? (init!.body as string) : "";
//   return `${method} ${url} ${body}`;
// }

function q(params: Record<string, string | number | boolean | null | undefined>) {
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    usp.set(k, String(v))
  })
  const s = usp.toString()
  return s ? `?${s}` : ''
}

// Core HTTP: do not loop on 401. One shot; caller handles auth state.
export async function http<T=unknown>(path: string, init?: RequestInit): Promise<T> {
  const url = apiUrl(path);
  const doFetch = async () => {
  const headers = withAuthHeaders({ 'Content-Type': 'application/json', ...(init?.headers || {}) as Record<string, string> });
  return fetch(url, withCreds({ ...init, headers }));
  };
  let res = await doFetch();
  if (res.status === 401) {
    // Attempt cookie-based refresh once, then retry original request
    try { await fetch(apiUrl('/auth/refresh'), withCreds({ method: 'POST' })); } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
    res = await doFetch();
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const snippet = txt ? ` — ${txt.slice(0, 200)}` : "";
    throw new Error(`${res.status} ${res.statusText}${snippet}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : (await res.text() as unknown as T);
}

// ---------------------------
// RAG (Admin-only UI consumers)
// ---------------------------
export async function ragIngest(urls: string[], force = false) {
  return fetchJSON<{ ok: boolean; results: Array<{ url: string; status: string; chunks?: number }> }>(
    'agent/rag/ingest',
    { method: 'POST', body: JSON.stringify({ urls, force }) }
  );
}

export async function ragQuery(queryStr: string, k = 8, rerank = true) {
  return fetchJSON<{ q: string; hits: Array<{ url: string; score: number; content: string }> }>(
    'agent/rag/query',
    { method: 'POST', body: JSON.stringify({ q: queryStr, k, rerank }) }
  );
}

export async function ragIngestFiles(files: File[], vendor?: string) {
  const fd = new FormData();
  if (vendor) fd.set('vendor', vendor);
  for (const f of files) fd.append('files', f);
  return fetchJSON<{ ok: boolean; results: Array<{ file: string; status: string; chunks?: number; reason?: string }> }>(
    'agent/rag/ingest/files',
    { method: 'POST', body: fd }
  );
}

// Convenience GET wrapper
export const apiGet = async <T = unknown>(path: string): Promise<T> => http<T>(path);

export async function apiPost<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const baseHeaders: HeadersInit = { 'Content-Type': 'application/json', ...(init?.headers || {}) as Record<string, string> };
  const payload = body === undefined ? undefined : JSON.stringify(body);

  let res: Response | undefined;
  let refreshed = false;
  let rateAttempt = 0;
  let shouldRetry = true;

  while (shouldRetry) {
    shouldRetry = false;
    const headers = withAuthHeaders(baseHeaders);
    res = await fetch(url, withCreds({
      ...init,
      method: 'POST',
      headers,
      body: payload,
    }));

    if (res.status === 401 && !refreshed) {
      refreshed = true;
      try { await fetch(`${API_BASE || ''}/auth/refresh`, withCreds({ method: 'POST' })); } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
      shouldRetry = true;
      continue;
    }

    if (res.status === 429) {
      if (rateAttempt >= RATE_LIMIT_MAX_RETRIES) {
        break;
      }
      const wait = RATE_LIMIT_BACKOFF_BASE_MS * Math.pow(2, rateAttempt);
      rateAttempt += 1;
      await sleep(wait);
      shouldRetry = true;
      continue;
    }
  }

  if (!res) {
    throw new Error('Unexpected empty response from apiPost');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Provide helpful message in dev (includes backend detail)
    throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : (await res.text() as unknown as T);
}

// ---- Suggestions normalizer (array-shape resilience) ----
export function normalizeSuggestions(payload: unknown): MinedRuleSuggestionStrict[] {
  if (isRuleSuggestionArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (isRuleSuggestionArray(obj.suggestions)) return obj.suggestions;
    if (isRuleSuggestionArray(obj.items)) return obj.items;
    const vals = Object.values(obj);
    if (isRuleSuggestionArray(vals)) return vals;
  }
  return [];
}

// ---------- Health ----------
export type Healthz = {
  status: 'ok' | 'degraded';
  db_engine?: string;
  models_ok?: boolean;
  alembic?: {
    db_revision?: string | null;
    code_head?: string | null;
    in_sync?: boolean;
  };
  alembic_ok?: boolean;
  db_revision?: string | null;
};

export async function getHealthz(): Promise<Healthz> {
  return fetchJSON<Healthz>('healthz');
}

export type MetaInfo = {
  ok: boolean;
  engine: string;
  alembic: {
    db_revision: string | null;
    code_head: string | null;
    code_heads: string[];
    in_sync: boolean;
    recent_migrations: Array<{
      revision: string;
      down_revision: string | null | string[];
      is_head: boolean;
      branch_labels: string[];
      message: string;
  filename?: string | null;
    }>;
  code_error?: string | null;
  };
};

export async function getMetaInfo(): Promise<MetaInfo> {
  return fetchJSON<MetaInfo>('meta/info');
}

// LLM health
export type LlmHealth = {
  ok: boolean;
  status: { ollama: string; openai: string };
  openai_key?: { present: boolean; source: 'env'|'file'|'absent' };
};

export async function getLlmHealth(): Promise<LlmHealth> {
  return fetchJSON<LlmHealth>('llm/health');
}

// mapper: rename keys (camelCase -> snake_case) and allow snake_case passthrough
// Currently unused but preserved for potential future use
// const mapKeys = <T extends object>(src: Record<string, unknown>, pairs: Record<string, string>) => {
//   const o: Record<string, unknown> = {};
//   for (const [from, to] of Object.entries(pairs)) {
//     if (src && src[from] !== undefined) o[to] = src[from];
//     if (src && src[to]   !== undefined) o[to] = src[to]; // allow snake too
//   }
//   return o as T;
// };

// ---------- Insights / Alerts ----------
// Use robust fetchJson; keep optional month for backward-compat callers
export const getInsights = (month?: string) =>
  fetchJSON(`insights`, { query: month ? { month } : undefined })
export const getAlerts = (month?: string) =>
  fetchJSON(`alerts`, { method: 'POST', body: JSON.stringify({ month }) })
export const downloadReportCsv = (month: string) => window.open(`${apiUrl('/report_csv')}${q({ month })}`,'_blank')

// ---------- Charts ----------
// Normalized UI types (isolate backend drift to mappers below)
export type UIMerchant = {
  // New canonical fields (preferred)
  merchant_canonical?: string;  // Canonical grouping key (lowercase, normalized)
  merchant_display?: string;    // User-facing display name (title case)
  sample_description?: string;  // Raw transaction example

  // Legacy fields (backward compatibility)
  merchant_key: string;
  label: string;  // Normalized display name

  // Aggregation data
  total: number;  // Total spend amount
  count: number;  // Transaction count
  statement_examples?: string[];
  category?: string;  // Learned category from merchant cache
};
export type UIDaily = { date: string; in: number; out: number; net: number };
export type UICategory = { name: string; amount: number };

export interface MonthSummaryResp {
  month: string | null;
  total_inflows?: number;
  total_outflows?: number;
  net?: number;
  daily?: UIDaily[];
  categories?: UICategory[];
}

// Normalized fetchers with backend → UI mapping
export async function getMonthSummary(month?: string): Promise<MonthSummaryResp | null> {
  if (!month) month = await resolveMonth();
  try {
    const r = await fetchJSON<Record<string, unknown>>(`agent/tools/charts/summary`, {
      method: 'POST',
      body: JSON.stringify({ month, include_daily: true })
    });
    if (!r) return null;
    return {
      month: r.month ? String(r.month) : null,
      total_inflows: num(r.total_inflows),
      total_outflows: num(r.total_outflows),
      net: num(r.net),
      daily: arr<Record<string, unknown>>(r.daily).map((d) => ({
        date: String(d.date ?? ''),
        in: num(d.inflow),
        out: num(d.outflow),
        net: num(d.net)
      })),
      categories: [] // Will be fetched separately
    };
  } catch (e) {
    console.warn('[api] getMonthSummary failed:', e);
    return null;
  }
}

export async function getMonthMerchants(month?: string): Promise<UIMerchant[]> {
  if (!month) month = await resolveMonth();
  try {
    const r = await fetchJSON<Record<string, unknown>>(`agent/tools/charts/merchants`, {
      method: 'POST',
      body: JSON.stringify({ month })
    });
    return arr<Record<string, unknown>>(r?.items).map((m) => ({
      // New canonical fields
      merchant_canonical: m.merchant_canonical ? String(m.merchant_canonical) : undefined,
      merchant_display: m.merchant_display ? String(m.merchant_display) : undefined,
      sample_description: m.sample_description ? String(m.sample_description) : undefined,

      // Legacy fields (for backward compatibility)
      merchant_key: String(m.merchant_key ?? m.merchant ?? 'unknown'),
      label: String(m.label ?? m.merchant ?? 'Unknown'),

      // Aggregation data
      total: num(m.total ?? m.spend),
      count: num(m.count ?? m.txns),
      statement_examples: arr<string>(m.statement_examples),
      category: m.category ? String(m.category) : undefined,
    }));
  } catch (e) {
    console.warn('[api] getMonthMerchants failed:', e);
    return [];
  }
}

export async function getMonthCategories(month?: string): Promise<UICategory[]> {
  if (!month) month = await resolveMonth();
  try {
    const r = await fetchJSON<Record<string, unknown>>(`agent/tools/budget/summary`, {
      method: 'POST',
      body: JSON.stringify({ month })
    });
    return arr<Record<string, unknown>>(r?.by_category).map((c) => ({
      name: String(c.category ?? 'Unknown'),
      amount: num(c.spend)
    }));
  } catch (e) {
    console.warn('[api] getMonthCategories failed:', e);
    return [];
  }
}

/**
 * Get all unique category names from transactions
 * Used for category picker dropdown
 */
export async function getAllCategoryNames(): Promise<string[]> {
  try {
    const result = await listTxns({ limit: 10000, offset: 0 });
    const categories = new Set<string>();
    result.items.forEach((t) => {
      const cat = typeof t === 'object' && t !== null ? (t as Record<string, unknown>).category : null;
      if (cat && typeof cat === 'string' && cat.trim()) {
        categories.add(cat.trim());
      }
    });
    return Array.from(categories).sort();
  } catch (e) {
    console.warn('[api] getAllCategoryNames failed:', e);
    return [];
  }
}

export async function getMonthFlows(month?: string): Promise<UIDaily[]> {
  // Daily flows = summary.daily (reuse from getMonthSummary logic)
  const summary = await getMonthSummary(month);
  return summary?.daily ?? [];
}

export async function loadSpendingTrends(monthsArr: string[]) {
  // Prefer dashed slug; fallback to underscore until backend alias widely deployed
  try {
    return await fetchJSON('agent/tools/charts/spending-trends', { method: 'POST', body: JSON.stringify({ months: monthsArr }) });
  } catch {
    return fetchJSON('agent/tools/charts/spending_trends', { method: 'POST', body: JSON.stringify({ months: monthsArr }) });
  }
}

export async function getSpendingTrends(windowMonths = 6, anchorMonth?: string) {
  const month = anchorMonth || await resolveMonth();
  if (!month) return { trends: [] };
  const monthsArr = monthsBack(month, windowMonths);
  return loadSpendingTrends(monthsArr);
}

// ---------- Analytics (agent tools) ----------
export const analytics = {
  // Use fetchJSON with root passthrough paths to avoid /api redirects
  kpis: (month?: string, lookback_months = 6) =>
    fetchJSON(`agent/tools/analytics/kpis`, {
      method: 'POST',
      body: JSON.stringify({ month, lookback_months }),
    }),
  forecast: (
    month?: string,
    horizon = 3,
    opts?: { model?: "auto" | "ema" | "sarimax"; ciLevel?: 0 | 0.8 | 0.9 | 0.95 }
  ) => {
    const body: Record<string, unknown> = { month, horizon };
    if (opts?.model) body.model = opts.model;
    if (opts?.ciLevel && opts.ciLevel > 0) body.alpha = 1 - opts.ciLevel; // 0.8 -> alpha 0.2
    return fetchJSON(`agent/tools/analytics/forecast/cashflow`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  anomalies: (month?: string, lookback_months = 6) =>
    fetchJSON(`agent/tools/analytics/anomalies`, {
      method: 'POST',
      body: JSON.stringify({ month, lookback_months }),
    }),
  recurring: (month?: string, lookback_months = 6) =>
    fetchJSON(`agent/tools/analytics/subscriptions`, {
      method: 'POST',
      body: JSON.stringify({ month, lookback_months, mode: 'recurring' }),
    }),
  subscriptions: (month?: string, lookback_months = 6) =>
    fetchJSON(`agent/tools/analytics/subscriptions`, {
      method: 'POST',
      body: JSON.stringify({ month, lookback_months, mode: 'subscriptions' }),
    }),
  budgetSuggest: (month?: string, lookback_months = 6) =>
    fetchJSON(`agent/tools/analytics/budget/suggest`, {
      method: 'POST',
      body: JSON.stringify({ month, lookback_months }),
    }),
  alerts: (month?: string) =>
    fetchJSON(`agent/tools/analytics/alerts`, {
      method: 'POST',
      body: JSON.stringify({ month }),
    }),
  whatif: (payload: WhatIfParams): Promise<WhatIfResult> =>
    fetchJSON<WhatIfResult>(`agent/tools/analytics/whatif`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
};

// ---------- Telemetry ----------
export const telemetry = {
  helpOpen: (payload: { key: string; path: string; ts: number }) =>
    fetchJSON(`analytics/help_open`, { method: 'POST', body: JSON.stringify(payload) }),
  track: (event: string, props?: Record<string, string | number | boolean>) =>
    fetchJSON(`analytics/track`, { method: 'POST', body: JSON.stringify({ event, props, ts: Date.now() }) }).catch(() => {}),
};

// ---------- UI Help ----------
export const uiHelp = {
  describe: (key: string, month?: string, withContext = false) =>
    fetchJSON(`agent/tools/help/ui/describe`, { method: 'POST', body: JSON.stringify({ key, month, with_context: withContext }) }),
};

// ---------- Agent Describe ----------
export async function agentDescribe(key: string, body: Record<string, unknown> = {}, opts?: { rephrase?: boolean }) {
  const qs = opts?.rephrase ? '?rephrase=1' : '';
  return fetchJSON(`agent/describe/${encodeURIComponent(key)}${qs}`, {
    method: 'POST',
    body: JSON.stringify(withModel({ ...body, stream: false })),
  });
}

// Unified describe (new panel help) endpoint
export type DescribeResponse = {
  text: string;
  grounded: boolean;
  rephrased: boolean;
  llm_called?: boolean;
  provider: string;
  panel_id: string;
  mode?: 'learn' | 'explain';
  reasons?: string[];
};

export async function describe(
  panelId: string,
  body: Record<string, unknown>,
  opts?: { mode?: 'learn' | 'explain'; rephrase?: boolean; signal?: AbortSignal }
): Promise<DescribeResponse> {
  const basePayload = body && typeof body === 'object' ? body : {};
  const payload: Record<string, unknown> = { ...(basePayload as Record<string, unknown>) };
  if (opts?.mode) payload.mode = opts.mode;
  if (opts?.rephrase !== undefined) payload.rephrase = opts.rephrase;
  const panelPath = `/agent/describe/${encodeURIComponent(panelId)}`;
  const apiPrefix = API_BASE ? (API_BASE.endsWith('/api') ? API_BASE : `${API_BASE}/api`) : '/api';
  const url = `${apiPrefix}${panelPath}`;
  const headers = withAuthHeaders({ 'Content-Type': 'application/json' });
  const bodyJson = JSON.stringify(payload);
  const doFetch = () =>
    fetch(url, withCreds({
      method: 'POST',
      headers,
      body: bodyJson,
      signal: opts?.signal,
    }));

  let res = await doFetch();
  if (res.status === 401) {
    try {
      await fetch(`${API_BASE || ''}/auth/refresh`, withCreds({ method: 'POST' }));
    } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
    res = await doFetch();
  }

  if (!res.ok) {
    const msg = res.status === 405 ? 'Use POST /api/agent/describe/{panel_id}' : 'Help service temporarily unavailable';
    throw new Error(msg);
  }

  return res.json() as Promise<DescribeResponse>;
}

// ---------- Budgets ----------
export const budgetCheck = (month?: string) => {
  // Migrate to agent/tools path; accept either a month string or full input object
  const payload = typeof month === 'object' && month !== null ? month : (month ? { month } : {});
  return fetchJSON('agent/tools/budget/check', { method: 'POST', body: JSON.stringify(payload) });
}
export const getBudgetCheck = (month?: string) => {
  const payload = typeof month === 'object' && month !== null ? month : (month ? { month } : {});
  return fetchJSON('agent/tools/budget/check', { method: 'POST', body: JSON.stringify(payload) });
}

// (No agent/tools budget apply/delete endpoints; keep existing /budget/* helpers below.)

// ---------- Unknowns / Suggestions ----------
export async function getUnknowns(month?: string) {
  return fetchJSON('txns/unknowns', { query: month ? { month } : undefined });
}

export async function getSuggestions(month?: string) {
  return fetchJSON('ml/suggest', { query: month ? { month } : undefined });
}

// If you have explain/categorize helpers, keep them as-is
export const categorizeTxn = (id: number, category: string) => api<{ updated: number; category: string; txn_ids: number[] }>('agent/tools/transactions/categorize', {
  method: 'POST',
  body: JSON.stringify({ txn_ids: [id], category })
})

// Aliases for SuggestionPill component API
export const applyCategory = (id: number, category_slug: string) => categorizeTxn(id, category_slug);
export const promoteRule = (merchant_canonical: string, category_slug: string, priority = 50) =>
  promoteCategorizeRule({ merchant_canonical, category_slug, priority });
export const rejectSuggestion = (merchant_canonical: string, category_slug: string) =>
  rejectCategorizeSuggestion({ merchant_canonical, category_slug });

export const undoRejectSuggestion = (merchant_canonical: string, category_slug: string) =>
  api<{ ok: boolean; deleted?: number }>('agent/tools/categorize/feedback/undo', {
    method: 'POST',
    body: JSON.stringify({ merchant_canonical, category_slug }),
  });

// ---- Categorize suggestions (agent tools) ----
export type CategorizeSuggestion = {
  category_slug: string;
  score: number;
  why?: string[];
  // Learning indicator fields (populated when feedback exists)
  feedback_accepts?: number | null;
  feedback_rejects?: number | null;
  feedback_ratio?: number | null;
};
export async function suggestForTxn(txnId: number) {
  return api<{ txn: number; suggestions: CategorizeSuggestion[] }>('agent/tools/categorize/suggest', {
    method: 'POST',
    body: JSON.stringify({ txn_id: txnId }),
  });
}
export async function suggestForTxnBatch(txnIds: number[]) {
  return api<{ items: Array<{ txn: number; suggestions: CategorizeSuggestion[] }> }>('agent/tools/categorize/suggest/batch', {
    method: 'POST',
    body: JSON.stringify({ txn_ids: txnIds }),
  });
}
export async function promoteCategorizeRule(input: { category_slug: string; pattern?: string; merchant_canonical?: string; priority?: number; enabled?: boolean }) {
  return fetchJSON<{ ok: boolean; ack: string }>('agent/tools/categorize/promote', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// Don't suggest this (feedback)
export async function rejectCategorizeSuggestion(input: { merchant_canonical: string; category_slug: string }) {
  return fetchJSON<{ ok: boolean }>('agent/tools/categorize/feedback', {
    method: 'POST',
    body: JSON.stringify({ ...input, action: 'reject' })
  });
}

// ---- ML feedback (incremental learning) ----
// New ML feedback shape aligned to backend
export type FeedbackIn = {
  txn_id: number;
  merchant?: string;
  category: string;
  action: "accept" | "reject";
};
export async function mlFeedback(body: FeedbackIn) {
  return http<{ ok: boolean; id: number; suggestion_id?: number }>(
    '/ml/feedback',
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
// Legacy helper retained as no-op wrapper if still referenced elsewhere
export async function sendFeedback(txnId: number, label: string, _source: string = "user_change", _notes?: string) {
  try {
    await mlFeedback({ txn_id: txnId, category: label, action: 'accept' });
  } catch {
    // soft ignore in UI
  }
}

// ---------- Rules ----------
// Strongly-typed Rules API
export type Rule = {
  id: number;
  name: string;
  enabled: boolean;
  when: Record<string, unknown>;
  then: { category?: string };
  created_at?: string;
  updated_at?: string;
};

export type RuleInput = Omit<Rule, 'id' | 'created_at' | 'updated_at'>;
export type RuleCreateResponse = { id: string; display_name: string };
export type RuleListItem = { id: number; display_name: string; category?: string; active?: boolean };

export type RuleTestResult = {
  matched_count?: number; // legacy
  count?: number;         // new backend
  month?: string;
  sample: Array<{
    id: number;
    date: string;
    merchant?: string;
    description?: string;
    amount: number;
    category?: string | null;
  }>;
};

// Unified test payload/response for POST /rules/test
export type RuleTestPayload = { rule: RuleInput; month?: string };
export type RuleTestResponse = { count: number; sample: Array<Record<string, unknown>>; month?: string };

/**
 * Test a rule against transactions for a month (YYYY-MM).
 * Backend route: POST /rules/test  -> { count, sample: [...] }
 * Also tolerates legacy shapes and normalizes to { count, sample }.
 */
export async function testRule(payload: RuleTestPayload): Promise<RuleTestResponse> {
  const res = await http<Record<string, unknown>>(`/rules/test`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  // Normalize result
  if (Array.isArray(res)) {
    return { count: res.length, sample: res };
  }
  if (res && typeof res === 'object') {
    const count = Number(res.count ?? res.matched_count ?? res.total ?? res.matches ?? 0) || 0;
    const sample = Array.isArray(res.sample) ? res.sample : [];
    const month = typeof res.month === 'string' ? res.month : undefined;
    return { count, sample, month };
  }
  return { count: 0, sample: [] };
}

export type GetRulesParams = { active?: boolean; q?: string; limit?: number; offset?: number };
export type GetRulesResponse = { items: RuleListItem[]; total: number; limit: number; offset: number };
export async function getRules(params: GetRulesParams = {}): Promise<GetRulesResponse> {
  const usp = new URLSearchParams();
  if (params.active !== undefined) usp.set("active", String(params.active));
  if (params.q) usp.set("q", params.q);
  if (params.limit !== undefined) usp.set("limit", String(params.limit));
  if (params.offset !== undefined) usp.set("offset", String(params.offset));
  const qs = usp.toString();
  return http<GetRulesResponse>(`/rules${qs ? `?${qs}` : ''}`);
}
export const listRules = getRules;
// New brief list endpoint returning items[] with optional active filter
export const deleteRule = (id: number) => http(`/rules/${id}`, { method: 'DELETE' });

// Update rule (e.g., toggle active state)
export async function updateRule(id: number, body: Partial<RuleInput>): Promise<Rule> {
  try {
    const data = await fetchJSON(`rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return data as Rule;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`updateRule failed: ${String(error)}`);
  }
}

// Enhanced createRule with richer FastAPI error reporting (e.g., 422 validation errors)
// Per project instructions: use relative path 'rules' (no /api/ prefix)
export async function createRule(body: RuleInput): Promise<RuleCreateResponse> {
  try {
    const data = await fetchJSON('rules', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return data as RuleCreateResponse;
  } catch (error) {
    // Enhanced error reporting for 422 validation errors
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`createRule failed: ${String(error)}`);
  }
}

// ---------- ML ----------
export const mlSuggest = (month: string, limit=100, topk=3) => http(`/ml/suggest${q({ month, limit, topk })}`)

// Agent-tools rules wrappers aligned to backend
export async function rulesList() {
  return fetchJSON('agent/tools/rules'); // GET
}
export async function rulesCreate(body: { merchant?: string|null; description?: string|null; pattern?: string|null; category: string; active?: boolean }) {
  return fetchJSON('agent/tools/rules', { method: 'POST', body: JSON.stringify(body) });
}
export async function rulesDeleteId(ruleId: number) {
  return fetchJSON(`agent/tools/rules/${ruleId}`, { method: 'DELETE' });
}
export async function rulesTest(input: { pattern: string; target: 'merchant'|'description'; category: string; month: string; limit?: number }) {
  return fetchJSON('agent/tools/rules/test', { method: 'POST', body: JSON.stringify(input) });
}
export async function rulesApply(input: { pattern: string; target: 'merchant'|'description'; category: string; month: string; limit?: number }) {
  return fetchJSON('agent/tools/rules/apply', { method: 'POST', body: JSON.stringify(input) });
}
// Suggestions accept/ignore remain under /rules/suggestions* endpoints; keep existing helpers below.

// ---------- ML Train ----------
export async function mlTrain(month?: string, passes = 1, min_samples = 25) {
  const body = { month, passes, min_samples };
  return http(`/ml/train`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// ---------- ML / Reclassify helpers ----------
export async function trainModel(params?: { min_samples?: number; test_size?: number }) {
  return http(`/ml/train`, {
    method: 'POST',
    body: JSON.stringify(params ?? { min_samples: 6, test_size: 0.2 }),
  });
}

export async function reclassifyAll(month?: string): Promise<{
  status: string;
  month?: string;
  applied?: number;
  skipped?: number;
  details?: unknown;
  updated?: number;
}> {
  return http(`/txns/reclassify${month ? `?month=${encodeURIComponent(month)}` : ''}`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    }
  );
}

// One-click: Save → Train → Reclassify (no client-side fallback; unified endpoint is required)
export async function saveTrainReclassify(
  payload: { rule: RuleInput; month?: string }
): Promise<{ rule_id: string; display_name: string; reclassified: number }> {
  const res = await http<{ rule_id: string; display_name: string; reclassified: number }>(`/rules/save-train-reclass`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res;
}

// ---------- Explain & Agent ----------
// (Moved agent chat types & function earlier to satisfy references)
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type AgentChatRequest = {
  messages: { role: 'system'|'user'|'assistant', content: string }[];
  context?: unknown;
  intent?: 'general'|'explain_txn'|'budget_help'|'rule_seed';
  txn_id?: string | null;
  model?: string;
  temperature?: number;
  top_p?: number;
  conversational?: boolean;  // Enable conversational voice styling (default: true)
};
export type AgentChatResponse = TypedAgentChatResponse & {
  // Additional fields beyond the base type
  summary?: string;
  rephrased?: string | null;
  nlq?: unknown;
  citations: { type: string; id?: string; count?: number }[];
  used_context: { month?: string };
  tool_trace: Array<Record<string, unknown>>;
};
export async function agentChat(
  input: string | ChatMessage[] | AgentChatRequest,
  opts?: { system?: string }
): Promise<AgentChatResponse> {
  let request: AgentChatRequest;
  if (typeof input === 'object' && 'messages' in input) {
    request = input;
  } else {
    let messages: ChatMessage[];
    if (Array.isArray(input)) {
      messages = input;
    } else {
      messages = [];
      if (opts?.system) messages.push({ role: "system", content: opts.system });
      messages.push({ role: "user", content: input });
    }
    request = { messages, intent: 'general' };
  }
  return fetchJSON<AgentChatResponse>('agent/chat', {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withModel(request)),
  });
}

// ---------- Agent status ----------
export type AgentStatusResponse = TypedAgentStatusResponse & {
  // Additional fields beyond the base type
  fallbacks_last_15m?: number;
  last_llm_error?: string;
};

export async function agentStatus(): Promise<AgentStatusResponse> {
  return fetchJSON<AgentStatusResponse>('agent/status').catch(() => ({ ok: false, llm_ok: false }));
}

// ---------- Reports (Excel/PDF) ----------
function parseDispositionFilename(disposition: string | null) {
  if (!disposition) return null;
  const m = /filename="([^"]+)"/i.exec(disposition);
  return m?.[1] ?? null;
}

export async function downloadReportExcel(
  month?: string,
  includeTransactions: boolean = true,
  opts?: { start?: string; end?: string; splitAlpha?: boolean }
) {
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (opts?.start) params.set('start', opts.start);
  if (opts?.end) params.set('end', opts.end);
  params.set('include_transactions', String(includeTransactions));
  if (opts?.splitAlpha) params.set('split_transactions_alpha', String(!!opts.splitAlpha));
  const url = apiUrl(`/report/excel${params.toString() ? `?${params.toString()}` : ''}`);
  const res = await fetch(url, withCreds({ method: 'GET', headers: withAuthHeaders() }));
  if (!res.ok) throw new Error(`Excel export failed: ${res.status}`);
  const blob = await res.blob();
  const filename = parseDispositionFilename(res.headers.get('Content-Disposition')) || 'finance_report.xlsx';
  return { blob, filename };
}

export async function downloadReportPdf(month?: string, opts?: { start?: string; end?: string }) {
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (opts?.start) params.set('start', opts.start);
  if (opts?.end) params.set('end', opts.end);
  const url = apiUrl(`/report/pdf${params.toString() ? `?${params.toString()}` : ''}`);
  const res = await fetch(url, withCreds({ method: 'GET', headers: withAuthHeaders() }));
  if (!res.ok) throw new Error(`PDF export failed: ${res.status}`);
  const blob = await res.blob();
  const filename = parseDispositionFilename(res.headers.get('Content-Disposition')) || 'finance_report.pdf';
  return { blob, filename };
}

// ---------- Natural-language Transactions Query ----------
export type TransactionsNlRequest = {
  query?: string;
  filters?: Record<string, unknown>;
};

export type TransactionsNlResponse = {
  reply: string;
  rephrased?: boolean;
  meta: Record<string, unknown>;
};

export const transactionsNl = async (
  payload: TransactionsNlRequest = {}
): Promise<TransactionsNlResponse> => {
  return fetchJSON<TransactionsNlResponse>('transactions/nl', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  });
};

// New NL search with inline results
export type SearchTransactionsNlRequest = {
  query: string;
};

export type SearchTransactionsNlItem = {
  id: number;
  booked_at: string;
  merchant_canonical: string;
  amount: number;
  category_slug?: string | null;
};

export type SearchTransactionsNlResponse = {
  reply: string;
  query: string;
  total_count: number;
  total_amount: number;
  items: SearchTransactionsNlItem[];
};

export const searchTransactionsNl = async (
  query: string
): Promise<SearchTransactionsNlResponse> => {
  return fetchJSON<SearchTransactionsNlResponse>('agent/tools/transactions/search_nl', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
};

// Insights expanded tool types
export type InsightsExpandedRequest = {
  month?: string | null;
  large_limit?: number;
  status?: 'all' | 'posted' | 'pending';
  view?: 'insights' | 'deep_dive';
};

export type InsightsExpandedResponse = {
  reply: string;
  month: string;
  summary: { income: number; spend: number; net: number } | null;
  mom: {
    income: { curr: number; prev: number; delta: number; pct: number | null };
    spend: { curr: number; prev: number; delta: number; pct: number | null };
    net: { curr: number; prev: number; delta: number; pct: number | null };
  } | null;
  unknown_spend: { count: number; amount: number } | null;
  top_categories: Array<{ category: string; amount: number }>;
  top_merchants: Array<{ merchant: string; amount: number }>;
  large_transactions: Array<{
    id: number;
    date: string | null;
    merchant: string;
    description: string;
    amount: number;
    category: string | null;
  }>;
  anomalies: {
    categories: Array<{ key: string; curr: number; prev: number; delta: number; pct: number | null }>;
    merchants: Array<{ key: string; curr: number; prev: number; delta: number; pct: number | null }>;
  };
  llm_prompt?: string;
};

export const insightsExpanded = async (
  month?: string | null,
  largeLimit: number = 10
): Promise<InsightsExpandedResponse> => {
  return fetchJSON<InsightsExpandedResponse>('agent/tools/insights/expanded', {
    method: 'POST',
    body: JSON.stringify({ month, large_limit: largeLimit, status: 'posted', view: 'insights' }),
  });
};

export const financeDeepDive = async (
  month?: string | null,
  largeLimit: number = 10
): Promise<InsightsExpandedResponse> => {
  return fetchJSON<InsightsExpandedResponse>('agent/tools/insights/expanded', {
    method: 'POST',
    body: JSON.stringify({ month, large_limit: largeLimit, status: 'posted', view: 'deep_dive' }),
  });
};

// Budget suggest tool types
export type BudgetSuggestRequest = {
  month?: string | null;
};

export type BudgetCategorySuggestion = {
  category_slug: string;
  category_label: string;
  spend: number;
  suggested: number;
};

export type BudgetSuggestResponse = {
  reply: string;
  month: string;
  total_spend: number;
  suggested_budget: number;
  categories: BudgetCategorySuggestion[];
};

export const budgetSuggest = async (
  month?: string | null
): Promise<BudgetSuggestResponse> => {
  return fetchJSON<BudgetSuggestResponse>('agent/tools/analytics/budget/suggest', {
    method: 'POST',
    body: JSON.stringify({ month }),
  });
};

// Recurring tool types
export type RecurringToolRequest = {
  month?: string | null;
};

export type RecurringItem = {
  merchant: string;
  amount: number;
  category_slug?: string | null;
  average_interval_days?: number | null;
  last_seen?: string | null;
};

export type RecurringToolResponse = {
  reply: string;
  month: string;
  recurring: RecurringItem[];
};

export const recurringTool = async (
  month?: string | null
): Promise<RecurringToolResponse> => {
  return fetchJSON<RecurringToolResponse>('agent/tools/analytics/recurring', {
    method: 'POST',
    body: JSON.stringify({ month }),
  });
};

// Find subscriptions tool types
export type FindSubscriptionsToolRequest = {
  month?: string | null;
};

export type SubscriptionItem = {
  merchant: string;
  amount: number;
  category_slug?: string | null;
  first_seen?: string | null;
  last_seen?: string | null;
  txn_count: number;
};

export type FindSubscriptionsToolResponse = {
  reply: string;
  month: string;
  subscriptions: SubscriptionItem[];
};

export const findSubscriptionsTool = async (
  month?: string | null
): Promise<FindSubscriptionsToolResponse> => {
  return fetchJSON<FindSubscriptionsToolResponse>('agent/tools/analytics/subscriptions/find', {
    method: 'POST',
    body: JSON.stringify({ month }),
  });
};

export type TxnQueryResult =
  | { intent: "sum"; filters: Record<string, unknown>; result: { total_abs: number }; meta?: Record<string, unknown> }
  | { intent: "count"; filters: Record<string, unknown>; result: { count: number }; meta?: Record<string, unknown> }
  | { intent: "top_merchants"; filters: Record<string, unknown>; result: { merchant: string; spend: number }[]; meta?: Record<string, unknown> }
  | { intent: "top_categories"; filters: Record<string, unknown>; result: { category: string; spend: number }[]; meta?: Record<string, unknown> }
  | { intent: "average"; filters: Record<string, unknown>; result: { average_abs: number }; meta?: Record<string, unknown> }
  | { intent: "by_day"; filters: Record<string, unknown>; result: { bucket: string; spend: number }[]; meta?: Record<string, unknown> }
  | { intent: "by_week"; filters: Record<string, unknown>; result: { bucket: string; spend: number }[]; meta?: Record<string, unknown> }
  | { intent: "by_month"; filters: Record<string, unknown>; result: { bucket: string; spend: number }[]; meta?: Record<string, unknown> }
  | { intent: "list"; filters: Record<string, unknown>; result: Array<Record<string, unknown>>; meta?: Record<string, unknown> };

export async function txnsQuery(
  query: string,
  opts?: { start?: string; end?: string; limit?: number; page?: number; page_size?: number; flow?: 'expenses'|'income'|'all' }
): Promise<TxnQueryResult> {
  return fetchJSON<TxnQueryResult>('agent/txns_query', {
    method: 'POST',
    body: JSON.stringify({ q: query, ...opts }),
  });
}

// Download CSV for an NL transactions query. Server forces list intent and caps size.
export async function txnsQueryCsv(
  query: string,
  opts?: { start?: string; end?: string; page_size?: number; flow?: 'expenses'|'income'|'all' }
): Promise<{ blob: Blob; filename: string }> {
  const url = apiUrl('/agent/txns_query/csv');
  const res = await fetch(url, withCreds({
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ q: query, ...opts }),
  }));
  if (!res.ok) throw new Error(`CSV export failed: ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const filename = parseDispositionFilename(res.headers.get('Content-Disposition')) || 'txns_query.csv';
  return { blob, filename };
}

// --- Legacy suggestions / insights (removed) ---
// Calls intentionally neutralized. Use SUGGESTIONS_ENABLED + legacy guard helper instead.

// ---------- Budget Recommendations ----------
export type BudgetRecommendation = {
  category: string;
  median: number;
  p75: number;
  avg: number;
  sample_size: number;
  current_month?: number | null;
  over_p75?: boolean | null;
};

export type BudgetRecommendationsResp = {
  months: number;
  recommendations: BudgetRecommendation[];
};

export const getBudgetRecommendations = (
  months = 6,
  opts?: { include_current?: boolean; include_only_over_p75?: boolean; include?: string[]; exclude?: string[] }
) => {
  const params = new URLSearchParams();
  params.set("months", String(months));
  if (opts?.include_current !== undefined) params.set("include_current", String(!!opts.include_current));
  if (opts?.include_only_over_p75) params.set("include_only_over_p75", "true");
  if (opts?.include?.length) params.set("include", opts.include.join(","));
  if (opts?.exclude?.length) params.set("exclude", opts.exclude.join(","));
  return http<BudgetRecommendationsResp>(`/budget/recommendations?${params.toString()}`);
};

export type ApplyBudgetsReq = {
  strategy: "median" | "p75" | "median_plus_10";
  categories_include?: string[] | null;
  categories_exclude?: string[] | null;
  months?: number;
};

// ---------- Transactions (Edit & Manage) ----------
// Backend routes live under /txns/edit to avoid conflicts with legacy /txns
export async function listTxns(params: {
  q?: string;
  month?: string;
  category?: string;
  merchant?: string;
  include_deleted?: boolean;
  status?: "all" | "posted" | "pending";
  limit?: number;
  offset?: number;
  sort?: string;
}) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    usp.set(k, String(v));
  }
  const qs = usp.toString();
  return fetchJSON<{ items: Array<Record<string, unknown>>; total: number; limit: number; offset: number }>(`txns/edit${qs ? `?${qs}` : ""}`);
}

export function getTxn(id: number): Promise<Transaction> {
  return fetchJSON<Transaction>(`txns/edit/${id}`);
}

export function patchTxn(id: number, patch: Record<string, unknown>) {
  return fetchJSON(`txns/edit/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function bulkPatchTxns(ids: number[], patch: Record<string, unknown>) {
  return fetchJSON(`txns/edit/bulk`, { method: "POST", body: JSON.stringify({ ids, patch }) });
}

export function deleteTxn(id: number) {
  return fetchJSON(`txns/edit/${id}`, { method: "DELETE" });
}

export function restoreTxn(id: number) {
  return fetchJSON(`txns/edit/${id}/restore`, { method: "POST" });
}

export function splitTxn(
  id: number,
  parts: { amount: number | string; category?: string; note?: string }[]
) {
  return fetchJSON(`txns/edit/${id}/split`, { method: "POST", body: JSON.stringify({ parts }) });
}

export function mergeTxns(ids: number[], merged_note?: string) {
  return fetchJSON(`txns/edit/merge`, { method: "POST", body: JSON.stringify({ ids, merged_note }) });
}

export function linkTransfer(id: number, counterpart_id: number, group?: string) {
  return fetchJSON(`txns/edit/${id}/transfer`, { method: "POST", body: JSON.stringify({ counterpart_id, group }) });
}
export type ApplyBudgetsResp = {
  ok: boolean;
  applied: Array<{ category: string; amount: number }>;
  applied_count: number;
  applied_total: number;
};
export const applyBudgets = (req: ApplyBudgetsReq) =>
  http<ApplyBudgetsResp>(`/budget/apply`, { method: "POST", body: JSON.stringify(req) });

// Set a single budget cap (upsert)
export const setBudget = (category: string, amount: number) =>
  http<{ ok: boolean; budget: { category: string; amount: number; updated_at?: string | null } }>(
    "/budget/set",
    {
      method: "POST",
      body: JSON.stringify({ category, amount }),
      headers: { "Content-Type": "application/json" },
    }
  );

export const deleteBudget = (category: string) =>
  http<{ ok: boolean; deleted: { category: string; amount: number } }>(
    `/budget/${encodeURIComponent(category)}`,
    { method: "DELETE" }
  );

// Clear a temporary budget overlay for a given month/category
export const clearTempBudget = (category: string, month?: string) =>
  http<{ ok: boolean; deleted: { month: string; category: string; amount: number; existed: boolean } }>(
    `/budgets/temp/${encodeURIComponent(category)}${month ? `?month=${encodeURIComponent(month)}` : ""}`,
    { method: "DELETE" }
  );

// ---------- Anomalies ----------
export type Anomaly = {
  category: string;
  current: number;
  median: number;
  pct_from_median: number; // +0.42 => +42%
  sample_size: number;
  direction: "high" | "low";
};
export const getAnomalies = (params?: { months?: number; min?: number; threshold?: number; max?: number; month?: string }) => {
  const p = new URLSearchParams();
  if (params?.months) p.set("months", String(params.months));
  if (params?.min != null) p.set("min_spend_current", String(params.min));
  if (params?.threshold != null) p.set("threshold_pct", String(params.threshold));
  if (params?.max) p.set("max_results", String(params.max));
  if (params?.month) p.set("month", String(params.month));
  const qs = p.toString();
  return http<{ month: string | null; anomalies: Anomaly[] }>(`/insights/anomalies${qs ? `?${qs}` : ''}`);
};

// Agent-tools analytics wrapper (duplicates getAnomalies as POST variant)
export async function insightsAnomalies(input: Record<string, unknown>) {
  return fetchJSON('agent/tools/analytics/anomalies', { method: 'POST', body: JSON.stringify(input ?? {}) });
}
// Subscriptions live under analytics router
export async function whatIf(input: Record<string, unknown>) {
  return fetchJSON('agent/tools/analytics/whatif', { method: 'POST', body: JSON.stringify(input ?? {}) });
}

// Remove a category from the anomalies ignore list
export const unignoreAnomaly = (category: string) =>
  http<{ ignored: string[] }>(`/insights/anomalies/ignore/${encodeURIComponent(category)}`, { method: "DELETE" });

// ---- Planner helpers expected by Dev panel ----
export type AgentPlanAction = { kind: string; [k: string]: unknown };

// Transactions agent-tools endpoints are search/categorize/get_by_ids; keep existing HTTP helpers for edit flows.
export type PlannerPlanItem = {
  kind: 'categorize_unknowns' | 'seed_rule' | 'budget_limit' | 'export_report' | string;
  title?: string;
  txn_ids?: number[];
  category?: string;
  limit?: number;
  impact?: string | number;
  [k: string]: unknown;
};

export async function agentPlanPreview(body: {
  month: string | null;
  prompt?: string;
  actions?: AgentPlanAction[];
}) {
  return api("/agent/plan/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function agentPlanApply(body: {
  month: string | null;
  actions: AgentPlanAction[];
}) {
  return api("/agent/plan/apply", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// Optional; some panels read a status card. If it 404s, return benign default.
export async function agentPlanStatus(): Promise<AgentPlanStatus> {
  try {
    return await api<AgentPlanStatus>("/agent/plan/status");
  } catch (e) {
    // If 404 or route missing, return a benign default without throwing
    const msg = String((e && typeof e === 'object' && 'message' in e) ? e.message : e || "");
    if (/\b404\b/.test(msg) || /Not Found/i.test(msg)) {
      return { enabled: false, openActions: 0 };
    }
    // For other errors, still return default to avoid dev console noise
    return { enabled: false, openActions: 0 };
  }
}

// ---- Save Rule endpoint helper ----
export type SaveRulePayload = {
  rule?: { name?: string; when?: Record<string, unknown>; then?: { category?: string } };
  scenario?: string;
  month?: string;
  backfill?: boolean;
};

export async function saveRule(payload: SaveRulePayload, opts?: { idempotencyKey?: string }): Promise<RuleSaveResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  return http<RuleSaveResponse>('/agent/tools/rules/save', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    credentials: 'include',
  });
}

// ---------- Agent models ----------
export type AgentModelsResponse = {
  provider?: string;
  default?: string;
  models?: { id: string }[];
  primary?: { provider?: string; reachable?: boolean; model?: string };
  fallback?: { provider?: string; reachable?: boolean; model?: string };
  models_ok?: boolean; // legacy / server-supplied if present
};

export async function fetchModels(refresh = false): Promise<AgentModelsResponse & { models_ok: boolean }> {
  const url = `/agent/models${refresh ? '?refresh=1' : ''}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'include' });
  if (!res.ok) throw new Error(`models fetch failed: ${res.status}`);
  const d = await res.json();
  const primaryOk = !!(d?.primary?.reachable && d?.primary?.model);
  const fallbackOk = !!(d?.fallback?.reachable && d?.fallback?.model);
  return { ...d, models_ok: primaryOk || fallbackOk };
}

// ============================================================================
// Chart Data Types & Normalization (future-proof mappers)
// ============================================================================
// Backend may return different field names across versions:
// - {total_outflows, total_inflows} OR {spend, income}
// - {items, top_merchants, merchants}
// - {by_category, categories}
// - {daily, points, series}
// These normalizers ensure consistent shape regardless of backend response format

export type ChartsSummary = { spend: number; income: number; net: number };
export type ChartsMerchants = { merchant: string; amount: number }[];
export type ChartsCategories = { category: string; spend: number }[];
// Note: ChartsFlows type represents the daily time series from summary endpoint
// For flow/Sankey data, see the flows endpoint which returns edges
export type ChartsFlows = { date: string; in: number; out: number; net: number }[];

// Type for the actual flows endpoint (Sankey/network data)
export type ChartsFlowsData = {
  month?: string;
  inflow: Array<{ name: string; amount: number }>;
  outflow: Array<{ name: string; amount: number }>;
};

const normSummary = (r: unknown): ChartsSummary => {
  const data = r as Record<string, unknown>;
  const spend = (data?.total_outflows ?? data?.spend ?? 0) as number;
  const income = (data?.total_inflows ?? data?.income ?? 0) as number;
  return {
    spend,
    income,
    net: (data?.net ?? (income - spend)) as number,
  };
};

const normMerchants = (r: unknown): ChartsMerchants => {
  const data = r as Record<string, unknown>;
  const items = (data?.items ?? data?.top_merchants ?? data?.merchants ?? []) as Array<Record<string, unknown>>;
  return items.map((m) => ({
    merchant: (m.merchant ?? m.name ?? m.title ?? 'Unknown') as string,
    amount: Math.abs((m.spend ?? m.amount ?? 0) as number),
  }));
};

const normCategories = (r: unknown): ChartsCategories => {
  const data = r as Record<string, unknown>;
  const items = (data?.items ?? data?.by_category ?? data?.categories ?? []) as Array<Record<string, unknown>>;
  return items.map((c) => ({
    category: (c.category ?? c.name ?? 'Unknown') as string,
    spend: Math.abs((c.spend ?? c.amount ?? 0) as number),
  }));
};

const normFlows = (r: unknown): ChartsFlowsData => {
  const data = r as Record<string, unknown>;
  const month = data?.month as string | undefined;

  // Backend returns edges array with {source, target, amount}
  // Transform to inflow/outflow arrays for UI
  const edges = (data?.edges ?? []) as Array<Record<string, unknown>>;

  const inflowMap = new Map<string, number>();
  const outflowMap = new Map<string, number>();

  for (const edge of edges) {
    const source = (edge.source ?? 'Unknown') as string;
    const target = (edge.target ?? 'Unknown') as string;
    const amount = Math.abs((edge.amount ?? 0) as number);

    // Accumulate by source (inflow) and target (outflow)
    if (source !== 'Unknown') {
      inflowMap.set(source, (inflowMap.get(source) ?? 0) + amount);
    }
    outflowMap.set(target, (outflowMap.get(target) ?? 0) + amount);
  }

  return {
    month,
    inflow: Array.from(inflowMap.entries()).map(([name, amount]) => ({ name, amount })),
    outflow: Array.from(outflowMap.entries()).map(([name, amount]) => ({ name, amount })),
  };
};

// ============================================================================
// Chart API Functions (with normalization)
// ============================================================================

export async function chartsSummary(month: string): Promise<ChartsSummary> {
  const res = await fetchJSON('agent/tools/charts/summary', {
    method: 'POST',
    body: JSON.stringify({ month })
  });
  return normSummary(res);
}

export async function chartsMerchants(month: string, limit = 10): Promise<ChartsMerchants> {
  const res = await fetchJSON('agent/tools/charts/merchants', {
    method: 'POST',
    body: JSON.stringify({ month, limit })
  });
  return normMerchants(res);
}

export async function chartsCategories(month: string, limit = 10): Promise<ChartsCategories> {
  // Note: currently using summary endpoint; switch to dedicated endpoint if available
  const res = await fetchJSON('agent/tools/charts/summary', {
    method: 'POST',
    body: JSON.stringify({ month, top_n: limit })
  });
  return normCategories(res);
}

export async function chartsFlows(month: string): Promise<ChartsFlowsData> {
  const res = await fetchJSON('agent/tools/charts/flows', {
    method: 'POST',
    body: JSON.stringify({ month })
  });
  return normFlows(res);
}

// ============================================================================
// Legacy agentTools wrapper (kept for backward compatibility)
// ============================================================================
export const agentTools = {
  // Charts (legacy wrapper - prefer direct functions above for type safety)
  chartsSummary: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/charts/summary', { method: 'POST', body: JSON.stringify(body), signal }),
  chartsMerchants: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/charts/merchants', { method: 'POST', body: JSON.stringify(body), signal }),
  chartsFlows: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/charts/flows', { method: 'POST', body: JSON.stringify(body), signal }),
  chartsSpendingTrends: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/charts/spending-trends', { method: 'POST', body: JSON.stringify(body), signal }),
  // Suggestions (returns { items, meta? })
  suggestionsWithMeta: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/suggestions', { method: 'POST', body: JSON.stringify(body), signal }),
  // Insights
  insightsExpanded: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/insights/expanded', { method: 'POST', body: JSON.stringify({ ...body, view: 'insights' }), signal }),
  financeDeepDive: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/insights/expanded', { method: 'POST', body: JSON.stringify({ ...body, view: 'deep_dive' }), signal }),
  // Transactions
  searchTransactions: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/transactions/search', { method: 'POST', body: JSON.stringify(body), signal }),
  categorizeTransactions: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/transactions/categorize', { method: 'POST', body: JSON.stringify(body), signal }),
  getTransactionsByIds: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/transactions/get_by_ids', { method: 'POST', body: JSON.stringify(body), signal }),
  // Budget
  budgetSummary: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/budget/summary', { method: 'POST', body: JSON.stringify(body), signal }),
  budgetCheck: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/budget/check', { method: 'POST', body: JSON.stringify(body), signal }),
  // Rules
  rulesTest: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/rules/test', { method: 'POST', body: JSON.stringify(body), signal }),
  rulesApply: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/rules/apply', { method: 'POST', body: JSON.stringify(body), signal }),
  rulesApplyAll: (body: Record<string, unknown>, signal?: AbortSignal) => fetchJSON('agent/tools/rules/apply_all', { method: 'POST', body: JSON.stringify(body), signal }),
};

// ---- Legacy / compatibility helpers expected by components ----
export async function getAgentModels(refresh = false) { return fetchModels(refresh); }

// Explain endpoint wrappers
export type ExplainResponse = {
  reply: string;
  meta?: Record<string, unknown>;
  model?: string;
  llm_rationale?: string;
  rationale?: string;
  mode?: string;
  evidence?: ExplainSignalData['evidence'];
};
export async function getExplain(txnId: number | string, opts?: { use_llm?: boolean }) {
  const query = opts?.use_llm ? { use_llm: 1 } : undefined;
  return fetchJSON<ExplainResponse>(`txns/${encodeURIComponent(String(txnId))}/explain`, { query });
}
export async function explainTxnForChat(txnId: number | string) {
  return getExplain(txnId, { use_llm: true });
}

// Rephrase (fallback implementation uses /agent/chat with a system prompt if dedicated endpoint absent)
export async function agentRephrase(text: string, _opts?: Record<string, unknown>): Promise<{ reply: string; model?: string }> {
  try {
    // Try the dedicated /agent/rephrase endpoint with correct AgentChatRequest format
    const r = await fetch(apiUrl('agent/rephrase'), withCreds({
      method: 'POST',
      headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        messages: [{ role: 'user', content: text }],
        intent: 'general'
      })
    }));
    if (r.ok) {
      const d = await r.json() as { reply?: string; text?: string; model?: string };
      return { reply: d.reply || d.text || '', model: d.model };
    }
  } catch { /* swallow */ }
  // Fallback: call agentChat with a system instruction
  const resp = await agentChat({ messages: [
    { role: 'system', content: 'Rephrase user content clearly and concisely without changing factual meaning.' },
    { role: 'user', content: text }
  ]});
  return { reply: resp.reply, model: resp.model };
}

// ML status + selftest
export async function getMlStatus(): Promise<{ classes?: string[]; feedback_count?: number; updated_at?: string | null; details?: unknown }> {
  return http('/ml/status');
}
export async function mlSelftest(): Promise<MLStatusResponse> {
  return http<MLStatusResponse>('/ml/selftest', { method: 'POST', body: JSON.stringify({}) });
}

// Simple CSV upload (auto-detect month server side). Backend expected route: /ingest/csv
export async function uploadCsv(file: File | Blob, replace = true, format = 'csv'): Promise<unknown> {
  // New canonical ingest path: POST /ingest?replace=bool&format=csv|xls|xlsx (no /csv suffix)
  const form = new FormData();
  let toSend: File | Blob = file;
  let filename = (file as File)?.name;
  if (!filename) {
    // Environment's FormData may otherwise assign a generic name like 'blob'; wrap into a File for stable name.
    try {
  const blobType = (file as unknown as { type?: string })?.type || 'text/csv';
  toSend = new File([file], 'upload.csv', { type: blobType });
      filename = 'upload.csv';
    } catch {
      // Fallback: append with explicit filename argument (some polyfills allow Blob + filename)
      filename = 'upload.csv';
    }
  }
  form.append('file', toSend, filename || 'upload.csv');
  const path = `/ingest`;
  return fetchJSON(path + `?replace=${replace ? 'true' : 'false'}&format=${encodeURIComponent(format)}`, {
    method: 'POST',
    body: form
  });
}

// Delete all transactions by sending an empty CSV with replace=true
export async function deleteAllTransactions(): Promise<void> {
  // The backend /ingest endpoint with replace=true deletes all transactions before ingesting
  // Send an empty CSV to trigger the delete without adding new data
  const emptyBlob = new Blob([''], { type: 'text/csv' });
  await uploadCsv(emptyBlob, true);
}

export async function fetchLatestMonth(): Promise<string | null> {
  // Canonical method: POST meta endpoint (GET may 405)
  try {
  const r = await fetchJSON('agent/tools/meta/latest_month', { method: 'POST' }) as { month?: string | null };
  return r.month ?? null;
  } catch { return null; }
}

// ============================================================================
// Category Rules Admin API
// ============================================================================

export type CategoryRule = {
  id: number;
  pattern: string;
  category_slug: string;
  priority: number;
  enabled: boolean;
};

export async function listCatRules(): Promise<CategoryRule[]> {
  const r = await fetchJSON('agent/tools/categorize/rules', { method: 'GET' });
  return r as CategoryRule[];
}

export async function patchCatRule(
  id: number,
  body: Partial<{ pattern: string; category_slug: string; priority: number; enabled: boolean }>
): Promise<{ ok: boolean; rule: CategoryRule }> {
  const r = await fetchJSON(`agent/tools/categorize/rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  return r as { ok: boolean; rule: CategoryRule };
}

export async function deleteCatRule(id: number): Promise<{ ok: boolean }> {
  const r = await fetchJSON(`agent/tools/categorize/rules/${id}`, {
    method: 'DELETE',
  });
  return r as { ok: boolean };
}

export async function testCatRule(
  pattern: string,
  samples: string[]
): Promise<{ ok: boolean; error?: string; matches: string[]; misses: string[] }> {
  const r = await fetchJSON('agent/tools/categorize/rules/test', {
    method: 'POST',
    body: JSON.stringify({ pattern, samples }),
  });
  return r as { ok: boolean; error?: string; matches: string[]; misses: string[] };
}

// ============================================================================
// ML Suggestions API
// ============================================================================

export type SuggestCandidate = {
  label: string;
  confidence: number;
  reasons: string[]
};

export type SuggestItem = {
  txn_id: string;
  event_id?: string;
  candidates: SuggestCandidate[]
};

export type SuggestRequest = {
  txn_ids: string[];
  top_k?: number;
  mode?: "heuristic" | "model" | "auto";
};

export async function getMLSuggestions(body: SuggestRequest): Promise<{ items: SuggestItem[] }> {
  const r = await fetchJSON('ml/suggestions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return r as { items: SuggestItem[] };
}

export async function sendSuggestionFeedback(
  event_id: string,
  action: "accept" | "reject" | "undo",
  reason?: string
): Promise<{ ok: boolean }> {
  const r = await fetchJSON('ml/suggestions/feedback', {
    method: 'POST',
    body: JSON.stringify({ event_id, action, reason }),
  });
  return r as { ok: boolean };
}
