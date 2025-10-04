import { RuleSuggestion as MinedRuleSuggestionStrict, isRuleSuggestionArray } from "@/types/rules";
import { fetchJSON, fetchAuth, dashSlug } from '@/lib/http';
import { FEATURES } from '@/config/featureFlags';

// Resolve API base from env, with a dev fallback when running Vite on port 5173
const rawApiBase = (import.meta as any).env?.VITE_API_BASE;
export const API_BASE = ((rawApiBase ?? '/api') as string).replace(/\/+$/, '') || '/api';

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

function cookieGet(name: string): string | null {
  try {
    const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : null;
  } catch {
    return null;
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
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
    const r: any = await fetchJSON('/agent/tools/meta/latest_month', { method: 'POST', body: JSON.stringify({}) });
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
type CacheEntry = { t: number; p: Promise<any> };
const CACHE_TTL_MS = 5000; // 5s shared cache across panels
const responseCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any>>();

// Simple request limiter (queue) to prevent stampedes
const MAX_CONCURRENCY = 4;
let active = 0;
const reqQueue: Array<() => void> = [];
function runOrQueue(fn: () => void) {
  if (active < MAX_CONCURRENCY) {
    active++;
    fn();
  } else {
    reqQueue.push(fn);
  }
}
function done() {
  active = Math.max(0, active - 1);
  const next = reqQueue.shift();
  if (next) {
    active++;
    next();
  }
}

function keyFromInit(url: string, init?: RequestInit) {
  const method = (init?.method || "GET").toUpperCase();
  const body = typeof init?.body === "string" ? (init!.body as string) : "";
  return `${method} ${url} ${body}`;
}

function q(params: Record<string, any>) {
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    usp.set(k, String(v))
  })
  const s = usp.toString()
  return s ? `?${s}` : ''
}

// Core HTTP: do not loop on 401. One shot; caller handles auth state.
export async function http<T=any>(path: string, init?: RequestInit): Promise<T> {
  const url = apiUrl(path);
  const doFetch = async () => {
  const headers = withAuthHeaders({ 'Content-Type': 'application/json', ...(init?.headers || {}) as any });
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
  return ct.includes('application/json') ? res.json() : (await res.text() as any);
}

// Convenience GET wrapper
export const apiGet = async <T = any>(path: string): Promise<T> => http<T>(path);

export async function apiPost<T = any>(path: string, body?: any, init?: RequestInit): Promise<T> {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const baseHeaders: HeadersInit = { 'Content-Type': 'application/json', ...(init?.headers || {}) as any };
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
  return ct.includes('application/json') ? res.json() : (await res.text() as any);
}

// ---- Suggestions normalizer (array-shape resilience) ----
export function normalizeSuggestions(payload: any): MinedRuleSuggestionStrict[] {
  if (isRuleSuggestionArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    if (isRuleSuggestionArray((payload as any).suggestions)) return (payload as any).suggestions;
    if (isRuleSuggestionArray((payload as any).items)) return (payload as any).items;
    const vals = Object.values(payload);
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
const mapKeys = <T extends object>(src: any, pairs: Record<string, string>) => {
  const o: any = {};
  for (const [from, to] of Object.entries(pairs)) {
    if (src && src[from] !== undefined) o[to] = src[from];
    if (src && src[to]   !== undefined) o[to] = src[to]; // allow snake too
  }
  return o as T;
};

// ---------- Insights / Alerts ----------
// Use robust fetchJson; keep optional month for backward-compat callers
export const getInsights = (month?: string) =>
  fetchJSON(`insights`, { query: month ? { month } : undefined })
export const getAlerts = (month?: string) =>
  fetchJSON(`alerts`, { query: month ? { month } : undefined })
export const downloadReportCsv = (month: string) => window.open(`${apiUrl('/report_csv')}${q({ month })}`,'_blank')

// ---------- Charts ----------
// (Removed legacy fetchJson wrapper; use fetchJSON from http.ts directly)

// Minimal shapes for charts responses (only fields accessed by components)
export interface MonthSummaryResp { month: string | null; categories?: Array<{ category: string; amount: number }>; }
export interface MonthMerchantsResp { month?: string | null; merchants?: Array<{ name: string; amount: number }>; }
export interface MonthFlowsResp { month?: string | null; series?: Array<{ name: string; value: number; month?: string }>; }

async function postChart<T>(endpoint: string, body: any): Promise<T | null> {
  try {
    return await fetchJSON<T>(`agent/tools/charts/${endpoint}`, { method: 'POST', body: JSON.stringify(body) });
  } catch (e) {
    // Swallow 404/410 gracefully – treat as null (empty state)
    return null;
  }
}

export async function getMonthSummary(month?: string): Promise<MonthSummaryResp | null> {
  if (!month) month = await resolveMonth();
  return postChart<MonthSummaryResp>('summary', { month });
}

export async function getMonthMerchants(month?: string): Promise<MonthMerchantsResp | null> {
  if (!month) month = await resolveMonth();
  return postChart<MonthMerchantsResp>('merchants', { month });
}

export async function getMonthFlows(month?: string): Promise<MonthFlowsResp | null> {
  if (!month) month = await resolveMonth();
  return postChart<MonthFlowsResp>('flows', { month });
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
  if (!month) return { trends: [] } as any;
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
    const body: any = { month, horizon };
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
    fetchJSON(`agent/tools/analytics/recurring`, {
      method: 'POST',
      body: JSON.stringify({ month, lookback_months }),
    }),
  subscriptions: (month?: string, lookback_months = 6) =>
    fetchJSON(`agent/tools/analytics/subscriptions`, {
      method: 'POST',
      body: JSON.stringify({ month, lookback_months }),
    }),
  budgetSuggest: (month?: string, lookback_months = 6) =>
    fetchJSON(`agent/tools/analytics/budget/suggest`, {
      method: 'POST',
      body: JSON.stringify({ month, lookback_months }),
    }),
  whatif: (payload: any) =>
    fetchJSON(`agent/tools/analytics/whatif`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
};

// ---------- Telemetry ----------
export const telemetry = {
  helpOpen: (payload: { key: string; path: string; ts: number }) =>
    fetchJSON(`analytics/help_open`, { method: 'POST', body: JSON.stringify(payload) }),
  track: (event: string, props?: Record<string, any>) =>
    fetchJSON(`analytics/track`, { method: 'POST', body: JSON.stringify({ event, props, ts: Date.now() }) }).catch(() => {}),
};

// ---------- UI Help ----------
export const uiHelp = {
  describe: (key: string, month?: string, withContext = false) =>
    fetchJSON(`agent/tools/help/ui/describe`, { method: 'POST', body: JSON.stringify({ key, month, with_context: withContext }) }),
};

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
  body: any,
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
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  return fetchJSON('txns/unknowns', { query: month ? { month } : undefined });
}

export async function getSuggestions(month?: string) {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  return fetchJSON('ml/suggest', { query: month ? { month } : undefined });
}

// Rule Suggestions config (thresholds + window)
export type RuleSuggestConfig = {
  min_support: number;
  min_positive: number;
  window_days: number | null;
};
// Suggestions permanently disabled: make this a silent no-op instead of throwing to avoid crashes in stray imports
export const SUGGESTIONS_ENABLED = !!FEATURES.suggestions;
export const fetchRuleSuggestConfig = () => {
  if (!SUGGESTIONS_ENABLED) {
    // eslint-disable-next-line no-console
    console.warn('Rule suggestions disabled');
    return Promise.resolve<RuleSuggestConfig | null>(null);
  }
  return http<RuleSuggestConfig>(`/rules/suggestions/config`);
};

// If you have explain/categorize helpers, keep them as-is
export const categorizeTxn = (id: number, category: string) => http(`/txns/${id}/categorize`, { method: 'POST', body: JSON.stringify({ category }) })

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
export async function sendFeedback(txnId: number, label: string, source: string = "user_change", notes?: string) {
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
export type RuleTestResponse = { count: number; sample: any[]; month?: string };

/**
 * Test a rule against transactions for a month (YYYY-MM).
 * Backend route: POST /rules/test  -> { count, sample: [...] }
 * Also tolerates legacy shapes and normalizes to { count, sample }.
 */
export async function testRule(payload: RuleTestPayload): Promise<RuleTestResponse> {
  const res = await http<any>(`/rules/test`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  // Normalize result
  if (Array.isArray(res)) {
    return { count: res.length, sample: res };
  }
  if (res && typeof res === 'object') {
    const count = Number((res as any).count ?? (res as any).matched_count ?? (res as any).total ?? (res as any).matches ?? 0) || 0;
    const sample = Array.isArray((res as any).sample) ? (res as any).sample : [];
    const month = (res as any).month;
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
// Enhanced createRule with richer FastAPI error reporting (e.g., 422 validation errors)
export async function createRule(body: RuleInput): Promise<RuleCreateResponse> {
  const url = apiUrl('/rules');
  const r = await fetch(url, withCreds({
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  }));
  if (!r.ok) {
    let msg = `createRule failed: ${r.status}`;
    try {
      const data = await r.json();
      if (data?.detail) {
        const text = Array.isArray(data.detail)
          ? data.detail.map((d: any) => d?.msg || JSON.stringify(d)).join('; ')
          : JSON.stringify(data.detail);
        msg += ` — ${text}`;
      }
    } catch {
      // Try to append response text if JSON parse fails
      try {
        const t = await r.text();
        if (t) msg += ` — ${t}`;
      } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
    }
    throw new Error(msg);
  }
  return r.json() as Promise<RuleCreateResponse>; // { id, display_name }
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

// ---------- Rule Suggestions (persistent) ----------
export type PersistedRuleSuggestion = {
  id: number;
  merchant_norm: string;
  category: string;
  support: number;
  positive_rate: number;
  last_seen: string | null;
  created_at: string | null;
};
export async function listRuleSuggestions(params: { merchant_norm?: string; category?: string; limit?: number; offset?: number } = {}) {
  const qs = q(params as any);
  return http<PersistedRuleSuggestion[]>(`/rules/suggestions${qs}`);
}
export const acceptRuleSuggestion = (id: number) => http<{ ok: boolean; rule_id: number }>(`/rules/suggestions/${id}/accept`, { method: 'POST' });
export const dismissRuleSuggestion = (id: number) => http<{ ok: boolean }>(`/rules/suggestions/${id}/dismiss`, { method: 'POST' });

// ---------- Suggestion Ignores (DB-backed) ----------
export const listSuggestionIgnores = (cached = true) =>
  http<{ ignores: { merchant: string; category: string }[] }>(`/rules/suggestions/ignores?cached=${cached ? "true" : "false"}`);

export const addSuggestionIgnore = (merchant: string, category: string) =>
  http<{ ignores: { merchant: string; category: string }[] }>(`/rules/suggestions/ignores`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchant, category }),
  });

export const removeSuggestionIgnore = (merchant: string, category: string) =>
  http<{ ignores: { merchant: string; category: string }[] }>(
    `/rules/suggestions/ignores/${encodeURIComponent(merchant)}/${encodeURIComponent(category)}`,
    { method: "DELETE" }
  );

// ---------- Rule Suggestions (mined summary) ----------
export type MinedRuleSuggestion = {
  merchant: string;
  category: string;
  count: number;
  window_days: number;
  sample_txn_ids: number[];
  recent_month_key?: string | null;
};
export type RuleSuggestionsSummary = {
  window_days: number;
  min_count: number;
  suggestions: MinedRuleSuggestion[];
};

export function listRuleSuggestionsSummary(params?: {
  windowDays?: number;
  minCount?: number;
  maxResults?: number;
  excludeMerchants?: string[];
  excludeCategories?: string[];
}) {
  const qp: Record<string, string> = {};
  if (params?.windowDays != null) qp.window_days = String(params.windowDays);
  if (params?.minCount != null) qp.min_count = String(params.minCount);
  if (params?.maxResults != null) qp.max_results = String(params.maxResults);
  if (params?.excludeMerchants?.length) qp.exclude_merchants = params.excludeMerchants.join(",");
  if (params?.excludeCategories?.length) qp.exclude_categories = params.excludeCategories.join(",");
  const qs = q(qp);
  return http<RuleSuggestionsSummary>(`/rules/suggestions${qs}`);
}

export const applyRuleSuggestion = (payload: { merchant: string; category: string; backfill_month?: string | null }) =>
  http<{ ok: boolean; rule_id: number; merchant: string; category: string; applied_backfill_month?: string | null }>(
    `/rules/suggestions/apply`,
    { method: 'POST', body: JSON.stringify(payload) }
  );

export const ignoreRuleSuggestion = (payload: { merchant: string; category: string }) =>
  http<{ ignored: Array<{ merchant: string; category: string }> }>(
    `/rules/suggestions/ignore`,
    { method: 'POST', body: JSON.stringify(payload) }
  );

// Convenience: persistent-style wrapper that always returns an object with `.suggestions` array
export const listRuleSuggestionsPersistent = async (params?: { windowDays?: number; minCount?: number; maxResults?: number }): Promise<{ suggestions: MinedRuleSuggestionStrict[] }> => {
  const p = new URLSearchParams();
  if (params?.windowDays) p.set("window_days", String(params.windowDays));
  if (params?.minCount) p.set("min_count", String(params.minCount));
  if (params?.maxResults) p.set("max_results", String(params.maxResults));
  const res = await http<any>(`/rules/suggestions${p.toString() ? `?${p.toString()}` : ''}`);
  return { suggestions: normalizeSuggestions(res) };
};

// ---- Persisted suggestions helpers (optional; 404-safe) ----
export type PersistedSuggestion = {
  id: number;
  merchant: string;
  category: string;
  status: "new" | "accepted" | "dismissed";
  count?: number;
  window_days?: number;
};

export const listPersistedSuggestions = async (): Promise<PersistedSuggestion[]> => {
  try {
    const res = await http<{ suggestions: PersistedSuggestion[] }>("/rules/suggestions/persistent");
    return Array.isArray((res as any)?.suggestions) ? (res as any).suggestions : [];
  } catch (e: any) {
    // Fallback on 404 or any error
    return [];
  }
};

export const acceptSuggestion = (id: number) =>
  http<{ ok: boolean; id: number; status: "accepted" }>(`/rules/suggestions/${id}/accept`, { method: "POST" });

export const dismissSuggestion = (id: number) =>
  http<{ ok: boolean; id: number; status: "dismissed" }>(`/rules/suggestions/${id}/dismiss`, { method: "POST" });
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
  details?: any;
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
  context?: any;
  intent?: 'general'|'explain_txn'|'budget_help'|'rule_seed';
  txn_id?: string | null;
  model?: string;
  temperature?: number;
  top_p?: number;
};
export type AgentChatResponse = {
  mode?: string;
  reply: string;
  summary?: string;
  rephrased?: string | null;
  nlq?: any;
  citations: { type: string; id?: string; count?: number }[];
  used_context: { month?: string };
  tool_trace: any[];
  model: string;
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
    body: JSON.stringify(request),
  } as any);
}

// ---------- Agent status ----------
export async function agentStatus() {
  return fetchJSON('agent/status').catch(() => ({}));
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
  filters?: Record<string, any>;
};

export type TransactionsNlResponse = {
  reply: string;
  rephrased?: boolean;
  meta: Record<string, any>;
};

export const transactionsNl = async (
  payload: TransactionsNlRequest = {}
): Promise<TransactionsNlResponse> => {
  return fetchJSON<TransactionsNlResponse>('transactions/nl', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  });
};

export type TxnQueryResult =
  | { intent: "sum"; filters: any; result: { total_abs: number }; meta?: any }
  | { intent: "count"; filters: any; result: { count: number }; meta?: any }
  | { intent: "top_merchants"; filters: any; result: { merchant: string; spend: number }[]; meta?: any }
  | { intent: "top_categories"; filters: any; result: { category: string; spend: number }[]; meta?: any }
  | { intent: "average"; filters: any; result: { average_abs: number }; meta?: any }
  | { intent: "by_day"; filters: any; result: { bucket: string; spend: number }[]; meta?: any }
  | { intent: "by_week"; filters: any; result: { bucket: string; spend: number }[]; meta?: any }
  | { intent: "by_month"; filters: any; result: { bucket: string; spend: number }[]; meta?: any }
  | { intent: "list"; filters: any; result: any[]; meta?: any };

export async function txnsQuery(
  q: string,
  opts?: { start?: string; end?: string; limit?: number; page?: number; page_size?: number; flow?: 'expenses'|'income'|'all' }
): Promise<TxnQueryResult> {
  return fetchJSON<TxnQueryResult>('agent/txns_query', {
    method: 'POST',
    body: JSON.stringify({ q, ...opts }),
  });
}

// Download CSV for an NL transactions query. Server forces list intent and caps size.
export async function txnsQueryCsv(
  q: string,
  opts?: { start?: string; end?: string; page_size?: number; flow?: 'expenses'|'income'|'all' }
): Promise<{ blob: Blob; filename: string }> {
  const url = apiUrl('/agent/txns_query/csv');
  const res = await fetch(url, withCreds({
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ q, ...opts }),
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
  return http<{ items: any[]; total: number; limit: number; offset: number }>(`/txns/edit${qs ? `?${qs}` : ""}`);
}

export function getTxn(id: number) {
  return http(`/txns/edit/${id}`);
}

export function patchTxn(id: number, patch: any) {
  return http(`/txns/edit/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function bulkPatchTxns(ids: number[], patch: any) {
  return http(`/txns/edit/bulk`, { method: "POST", body: JSON.stringify({ ids, patch }) });
}

export function deleteTxn(id: number) {
  return http(`/txns/edit/${id}`, { method: "DELETE" });
}

export function restoreTxn(id: number) {
  return http(`/txns/edit/${id}/restore`, { method: "POST" });
}

export function splitTxn(
  id: number,
  parts: { amount: number | string; category?: string; note?: string }[]
) {
  return http(`/txns/edit/${id}/split`, { method: "POST", body: JSON.stringify({ parts }) });
}

export function mergeTxns(ids: number[], merged_note?: string) {
  return http(`/txns/edit/merge`, { method: "POST", body: JSON.stringify({ ids, merged_note }) });
}

export function linkTransfer(id: number, counterpart_id: number, group?: string) {
  return http(`/txns/edit/${id}/transfer`, { method: "POST", body: JSON.stringify({ counterpart_id, group }) });
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
export async function insightsAnomalies(input: any) {
  return fetchJSON('agent/tools/analytics/anomalies', { method: 'POST', body: JSON.stringify(input ?? {}) });
}
// Subscriptions live under analytics router
export async function whatIf(input: any) {
  return fetchJSON('agent/tools/analytics/whatif', { method: 'POST', body: JSON.stringify(input ?? {}) });
}

// Remove a category from the anomalies ignore list
export const unignoreAnomaly = (category: string) =>
  http<{ ignored: string[] }>(`/insights/anomalies/ignore/${encodeURIComponent(category)}`, { method: "DELETE" });

// ---- Planner helpers expected by Dev panel ----
export type AgentPlanAction = { kind: string; [k: string]: any };

// Transactions agent-tools endpoints are search/categorize/get_by_ids; keep existing HTTP helpers for edit flows.
export type PlannerPlanItem = {
  kind: 'categorize_unknowns' | 'seed_rule' | 'budget_limit' | 'export_report' | string;
  title?: string;
  txn_ids?: number[];
  category?: string;
  limit?: number;
  impact?: string | number;
  [k: string]: any;
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
export async function agentPlanStatus() {
  try {
    return await api("/agent/plan/status");
  } catch (e: any) {
    // If 404 or route missing, return a benign default without throwing
    const msg = String(e?.message || e || "");
    if (/\b404\b/.test(msg) || /Not Found/i.test(msg)) {
      return { mode: "deterministic", steps: 0, throttle: null, available: false };
    }
    // For other errors, still return default to avoid dev console noise
    return { mode: "deterministic", steps: 0, throttle: null, available: false };
  }
}

// ---- Save Rule endpoint helper ----
export type SaveRulePayload = {
  rule?: { name?: string; when?: Record<string, any>; then?: { category?: string } };
  scenario?: string;
  month?: string;
  backfill?: boolean;
};

export async function saveRule(payload: SaveRulePayload, opts?: { idempotencyKey?: string }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  return http('/agent/tools/rules/save', {
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

// Lightweight agentTools wrapper (reintroduced)
export const agentTools = {
  // Charts
  chartsSummary: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/charts/summary', { method: 'POST', body: JSON.stringify(body), signal }),
  chartsMerchants: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/charts/merchants', { method: 'POST', body: JSON.stringify(body), signal }),
  chartsFlows: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/charts/flows', { method: 'POST', body: JSON.stringify(body), signal }),
  chartsSpendingTrends: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/charts/spending-trends', { method: 'POST', body: JSON.stringify(body), signal }),
  // Suggestions (returns { items, meta? })
  suggestionsWithMeta: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/suggestions', { method: 'POST', body: JSON.stringify(body), signal }),
  // Insights
  insightsExpanded: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/insights/expanded', { method: 'POST', body: JSON.stringify(body), signal }),
  // Transactions
  searchTransactions: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/transactions/search', { method: 'POST', body: JSON.stringify(body), signal }),
  categorizeTransactions: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/transactions/categorize', { method: 'POST', body: JSON.stringify(body), signal }),
  getTransactionsByIds: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/transactions/get_by_ids', { method: 'POST', body: JSON.stringify(body), signal }),
  // Budget
  budgetSummary: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/budget/summary', { method: 'POST', body: JSON.stringify(body), signal }),
  budgetCheck: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/budget/check', { method: 'POST', body: JSON.stringify(body), signal }),
  // Rules
  rulesTest: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/rules/test', { method: 'POST', body: JSON.stringify(body), signal }),
  rulesApply: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/rules/apply', { method: 'POST', body: JSON.stringify(body), signal }),
  rulesApplyAll: (body: any, signal?: AbortSignal) => fetchJSON('agent/tools/rules/apply_all', { method: 'POST', body: JSON.stringify(body), signal }),
};

// ---- Legacy / compatibility helpers expected by components ----
export async function getAgentModels(refresh = false) { return fetchModels(refresh); }

// Explain endpoint wrappers
export type ExplainResponse = {
  reply: string;
  meta?: any;
  model?: string;
  llm_rationale?: string;
  rationale?: string;
  mode?: string;
  evidence?: any;
};
export async function getExplain(txnId: number | string, opts?: { use_llm?: boolean }) {
  const use = opts?.use_llm ? '?use_llm=1' : '';
  return http<ExplainResponse>(`/txns/${encodeURIComponent(String(txnId))}/explain${use}`);
}
export async function explainTxnForChat(txnId: number | string) {
  return getExplain(txnId, { use_llm: true });
}

// Rephrase (fallback implementation uses /agent/chat with a system prompt if dedicated endpoint absent)
export async function agentRephrase(text: string, _opts?: any): Promise<{ reply: string; model?: string }> {
  try {
    // Try a hypothetical fast endpoint first (ignore failure)
    const r = await fetch(apiUrl('/agent/rephrase'), withCreds({
      method: 'POST',
      headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text })
    }));
    if (r.ok) {
      const d: any = await r.json();
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
export async function getMlStatus() { return http('/ml/status'); }
export async function mlSelftest() { return http('/ml/selftest', { method: 'POST', body: JSON.stringify({}) }); }

// Simple CSV upload (auto-detect month server side). Backend expected route: /ingest/csv
export async function uploadCsv(file: File | Blob, replace = true): Promise<unknown> {
  // New canonical ingest path: POST /ingest?replace=bool (no /csv suffix)
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
  return fetchJSON(path + `?replace=${replace ? 'true' : 'false'}`, {
    method: 'POST',
    body: form
  });
}
export async function fetchLatestMonth(): Promise<string | null> {
  // Canonical method: POST meta endpoint (GET may 405)
  try {
  const r = await fetchJSON('agent/tools/meta/latest_month', { method: 'POST' }) as { month?: string | null };
  return r.month ?? null;
  } catch { return null; }
}
