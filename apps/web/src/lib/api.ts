import { RuleSuggestion as MinedRuleSuggestionStrict, isRuleSuggestionArray } from "@/types/rules";

// Resolve API base from env, with a dev fallback when running Vite on port 5173
export const API_BASE = (import.meta as any)?.env?.VITE_API_BASE
  || (typeof window !== "undefined" && window.location?.port === "5173" ? "http://127.0.0.1:8000" : "");

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

async function http<T=any>(path: string, init?: RequestInit): Promise<T> {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      if (j?.detail) msg += ` — ${JSON.stringify(j.detail)}`;
    } catch {
      const t = await res.text().catch(() => "");
      if (t) msg += ` — ${t}`;
    }
    throw new Error(msg);
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
  return http<Healthz>('/healthz');
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
  return http<MetaInfo>('/meta/info');
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
  fetchJson(`/insights${month ? `?month=${encodeURIComponent(month)}` : ""}`)
export const getAlerts = (month?: string) =>
  fetchJson(`/alerts${month ? `?month=${encodeURIComponent(month)}` : ""}`)
export const downloadReportCsv = (month: string) => window.open(`${API_BASE || ""}/report_csv${q({ month })}`,'_blank')

// ---------- Charts ----------
export async function fetchJson(path: string, init?: RequestInit) {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const key = keyFromInit(url, init);

  // Pause network work when tab is hidden (prevents background waterfalls)
  if (typeof document !== "undefined" && (document as any).hidden) {
    await new Promise<void>((resolve) => {
      const onVis = () => {
        if (!(document as any).hidden) {
          document.removeEventListener("visibilitychange", onVis as any);
          resolve();
        }
      };
      document.addEventListener("visibilitychange", onVis as any, { once: true } as any);
    });
  }

  // Cached recent response?
  const now = Date.now();
  const hit = responseCache.get(key);
  if (hit && now - hit.t < CACHE_TTL_MS) return hit.p;

  // De-dupe identical in-flight requests
  if (inflight.has(key)) return inflight.get(key)!;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000); // 30s hard timeout
  const merged: RequestInit = { ...init, signal: controller.signal };

  const p = new Promise<any>((resolve, reject) => {
    runOrQueue(async () => {
      try {
        const res = await fetch(url, merged);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const json = res.status === 204 ? null : await res.json();
        resolve(json);
      } catch (e) {
        reject(e);
      } finally {
        clearTimeout(timeout);
        inflight.delete(key);
        responseCache.set(key, { t: Date.now(), p });
        done();
      }
    });
  });

  inflight.set(key, p);
  responseCache.set(key, { t: now, p });
  return p;
}

export async function getMonthSummary(month?: string) {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  return fetchJson(`/charts/month_summary${qs}`);
}

export async function getMonthMerchants(month?: string) {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  return fetchJson(`/charts/month_merchants${qs}`);
}

export async function getMonthFlows(month?: string) {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  return fetchJson(`/charts/month_flows${qs}`);
}

export async function getSpendingTrends(months = 6) {
  return fetchJson(`/charts/spending_trends?months=${months}`);
}

// ---------- Budgets ----------
export const budgetCheck = (month?: string) => {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  return fetchJson(`/budget/check${qs}`);
}
export const getBudgetCheck = (month?: string) => {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  return fetchJson(`/budget/check${qs}`);
}

// ---------- Unknowns / Suggestions ----------
export async function getUnknowns(month?: string) {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  return fetchJson(`/txns/unknowns${qs}`);
}

export async function getSuggestions(month?: string) {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  return fetchJson(`/ml/suggest${qs}`);
}

// Rule Suggestions config (thresholds + window)
export type RuleSuggestConfig = {
  min_support: number;
  min_positive: number;
  window_days: number | null;
};
export const fetchRuleSuggestConfig = () => http<RuleSuggestConfig>(`/rules/suggestions/config`);

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
  const url = API_BASE ? `${API_BASE}/rules` : `/rules`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
      } catch {}
    }
    throw new Error(msg);
  }
  return r.json() as Promise<RuleCreateResponse>; // { id, display_name }
}

// ---------- ML ----------
export const mlSuggest = (month: string, limit=100, topk=3) => http(`/ml/suggest${q({ month, limit, topk })}`)

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
// Legacy shim: route explain to unified chat to avoid 404 on /txns/{id}/explain
export const getExplain = async (txnId: number) => {
  const resp = await agentChat({
    messages: [{ role: 'user', content: `Explain transaction ${txnId} and suggest one action.` }],
    intent: 'explain_txn',
    txn_id: String(txnId)
  });
  return { reply: resp.reply, citations: resp.citations, model: resp.model } as any;
}

// Helper: unified chat for transaction explanations (returns formatted response for UI)
export async function explainTxnForChat(txnId: string | number): Promise<{
  reply: string;
  meta: {
    citations?: { type: string; id?: string; count?: number }[];
    ctxMonth?: string;
    trace?: any[];
    model?: string;
  };
}> {
  const resp = await agentChat({
    messages: [{ role:'user', content:`Explain transaction ${txnId} and suggest one action.` }],
    intent: 'explain_txn',
    txn_id: String(txnId)
  });
  return {
    reply: resp.reply,
    meta: {
      citations: resp.citations,
      ctxMonth: resp.used_context?.month,
      trace: resp.tool_trace,
      model: resp.model
    }
  };
}

export async function agentStatus() {
  return fetchJson(`/agent/status`).catch(() => ({}));
}

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

export type AgentModelsResponse = {
  provider: 'ollama' | 'openai' | string;
  default: string;
  models: { id: string }[];
};

export async function agentChat(
  input: string | ChatMessage[] | AgentChatRequest,
  opts?: { system?: string }
): Promise<AgentChatResponse> {
  let request: AgentChatRequest;
  
  if (typeof input === 'object' && 'messages' in input) {
    // New unified API format
    request = input;
  } else {
    // Legacy compatibility - convert to new format
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

  return fetchJson(`/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export async function getAgentModels(): Promise<AgentModelsResponse> {
  return fetchJson(`/agent/models`);
}

export async function agentStatusOk(): Promise<boolean> {
  try {
    const r = await fetchJson(`/agent/status`);
    return !!(r?.pong === true || r?.status === "ok" || r?.ok === true || /pong/i.test(JSON.stringify(r)));
  } catch {
    return false;
  }
}

// ---------- ML: selftest ----------
export async function mlSelftest(): Promise<any> {
  return http('/ml/selftest', { method: 'POST' });
}

// ---- De-dupe ml/status requests to avoid floods/overlaps ----
let _mlStatusInflight: Promise<any> | null = null;
export async function getMlStatus(): Promise<{
  classes?: string[];
  feedback_count?: number;
  updated_at?: string | null;
  details?: any;
}> {
  if (_mlStatusInflight) return _mlStatusInflight;
  _mlStatusInflight = http('/ml/status')
    .catch((e) => { throw e; })
    .finally(() => { _mlStatusInflight = null; });
  return _mlStatusInflight;
}

// ---------- CSV ingest ----------
// web/src/lib/api.ts
export async function uploadCsv(file: File, replace = true, expensesArePositive?: boolean) {
  const form = new FormData();
  form.append("file", file, file.name);
  const params = new URLSearchParams({
    replace: replace ? "true" : "false",
  });
  // Only add expenses_are_positive if explicitly provided
  if (expensesArePositive !== undefined) {
    params.set("expenses_are_positive", expensesArePositive ? "true" : "false");
  }
  return fetchJson(`/ingest?${params.toString()}`, {
    method: "POST",
    body: form,
  });
}

// ---------- Agent Tools (Transactions, Budget, Insights, Charts, Rules) ----------
// Generic POST helper for Agent Tools (reuses existing http() which handles API_BASE and JSON headers)
async function postTool<T = any>(path: string, payload: any, init?: RequestInit): Promise<T> {
  return http<T>(path, { method: "POST", body: JSON.stringify(payload), ...(init || {}) });
}

// ---------- Meta (Agent Tools) ----------
export const meta = {
  // No body; simple POST
  latestMonth: () => http("/agent/tools/meta/latest_month", { method: "POST", body: "{}" }),
  
  // Optional: distinct months list (if you add it later)
  months: () => http("/agent/tools/meta/months", { method: "POST" }),
  
  // Git version info
  version: () => http("/agent/tools/meta/version", { method: "POST" }),
};

// Namespaced helpers for agent tool endpoints
export const agentTools = {
  // Transactions
  searchTransactions: (payload: {
    month?: string;
    limit?: number;
    offset?: number;
  sort?: { field: string; dir: "asc" | "desc" };
    filters?: {
      merchant?: string;
      minAmount?: number;
      maxAmount?: number;
      category?: string;
      labeled?: boolean; // true = labeled only, false = unlabeled only, omit = all
    };
  }, signal?: AbortSignal) => postTool("/agent/tools/transactions/search", payload, { signal }),

  categorizeTransactions: (payload: {
    updates: Array<{ id: number | string; category: string }>;
    onlyIfUnlabeled?: boolean; // backend should respect this; defaults true
  }, signal?: AbortSignal) => postTool("/agent/tools/transactions/categorize", payload, { signal }),

  getTransactionsByIds: (payload: { ids: Array<number | string> }, signal?: AbortSignal) =>
    postTool("/agent/tools/transactions/get_by_ids", payload, { signal }),

  // Budget
  budgetSummary: (payload: { month?: string }, signal?: AbortSignal) =>
    postTool("/agent/tools/budget/summary", payload, { signal }),

  budgetCheck: (payload: { month?: string }, signal?: AbortSignal) =>
    postTool("/agent/tools/budget/check", payload, { signal }),

  // Insights
  insightsExpanded: (payload: { month?: string; large_limit?: number; largeLimit?: number }, signal?: AbortSignal) =>
    postTool("/agent/tools/insights/expanded", {
      month: payload?.month,
      ...mapKeys(payload, { largeLimit: "large_limit" }),
    }, { signal }),

  // Charts
  chartsSummary: (payload: { month?: string }, signal?: AbortSignal) =>
    postTool("/agent/tools/charts/summary", payload, { signal }),

  chartsMerchants: (payload: { month?: string; limit?: number }, signal?: AbortSignal) =>
    postTool("/agent/tools/charts/merchants", payload, { signal }),

  chartsFlows: (payload: { month?: string }, signal?: AbortSignal) =>
    postTool("/agent/tools/charts/flows", payload, { signal }),

  chartsSpendingTrends: (
    payload: { month?: string; monthsBack?: number; months_back?: number },
    signal?: AbortSignal
  ) =>
    postTool(
      "/agent/tools/charts/spending_trends",
      {
        month: payload.month,
  ...mapKeys(payload, { monthsBack: "months_back" }),
        ...(payload.months_back !== undefined ? { months_back: payload.months_back } : {}),
      },
      { signal }
    ),

  // Rules
  rulesTest: (payload: {
    rule: { merchant?: string; description?: string; pattern?: string; category?: string };
    month?: string;
  }, signal?: AbortSignal) => postTool("/agent/tools/rules/test", payload, { signal }),

  rulesApply: (payload: {
    rule: { merchant?: string; description?: string; pattern?: string; category: string };
    month?: string;
    onlyUnlabeled?: boolean; // default true in backend
  }, signal?: AbortSignal) => postTool("/agent/tools/rules/apply", payload, { signal }),

  rulesApplyAll: (payload: { month?: string }, signal?: AbortSignal) =>
    postTool("/agent/tools/rules/apply_all", payload, { signal }),
};

// ---------- Agent Tools: Rules CRUD ----------
export const rulesCrud = {
  list: () => http("/agent/tools/rules"),
  create: (rule: { merchant?: string; description?: string; pattern?: string; category: string; active?: boolean }) =>
    http("/agent/tools/rules", { method: "POST", body: JSON.stringify(rule) }),
  update: (
    id: number,
    rule: Partial<{ merchant: string; description: string; pattern: string; category: string; active: boolean }>
  ) => http(`/agent/tools/rules/${id}`, { method: "PUT", body: JSON.stringify(rule) }),
  remove: (id: number) => http(`/agent/tools/rules/${id}`, { method: "DELETE" }),
};

// ---------- Helper: resolve latest month from backend ----------
export async function fetchLatestMonth(): Promise<string | null> {
  const res = await fetch(`${API_BASE}/agent/tools/meta/latest_month`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  if (!res.ok) return null;
  const data = await res.json(); // { month: "YYYY-MM" | null }
  return data?.month ?? null;
}

// Original fetchLatestMonth with retry and fallback (kept for compatibility)
export async function fetchLatestMonthWithFallback(): Promise<string | null> {
  // Try meta route (fast path) with a tiny retry
  for (let i = 0; i < 2; i++) {
    try {
      const r = await meta.latestMonth();
      if (r && typeof r.month === "string" && r.month.length >= 7) return r.month;
    } catch { /* ignore and retry once */ }
  }

  // Fallback: ask transactions.search for the newest txn and derive YYYY-MM
  try {
    const res = await agentTools.searchTransactions({
      limit: 1,
      sort: { field: "date", dir: "desc" }, // harmless if backend ignores
    });
    if (typeof res?.month === "string") return res.month;
    const first = res?.items?.[0] ?? res?.transactions?.[0] ?? res?.data?.[0];
    if (first?.month) return first.month;
    if (typeof first?.date === "string" && first.date.length >= 7) {
      return first.date.slice(0, 7);
    }
  } catch { /* ignore */ }

  return null;
}

// Hybrid resolver used by App boot
export async function resolveLatestMonthHybrid(): Promise<string | null> {
  // A) meta.latest_month (fast path, 1 retry)
  for (let i = 0; i < 2; i++) {
    try {
      console.debug("[boot] try meta.latestMonth");
      const r = await meta.latestMonth();
      const m = (r && typeof r.month === "string") ? r.month : null;
      if (m && m.length >= 7) {
        console.debug("[boot] meta.latestMonth OK:", m);
        return m;
      }
      console.debug("[boot] meta.latestMonth returned:", r);
    } catch (e) {
      console.debug("[boot] meta.latestMonth failed:", e);
    }
  }

  // B) charts.summary without month; backend should default & echo back
  try {
    console.debug("[boot] try charts.summary {}");
    const cs = await agentTools.chartsSummary({}); // intentionally empty body
    const m = (cs && typeof cs.month === "string") ? cs.month : null;
    if (m && m.length >= 7) {
      console.debug("[boot] charts.summary OK:", m);
      return m;
    }
    console.debug("[boot] charts.summary returned:", cs);
  } catch (e) {
    console.debug("[boot] charts.summary failed:", e);
  }

  // C) transactions.search newest → derive YYYY-MM
  try {
    console.debug("[boot] try transactions.search newest");
    const ts = await agentTools.searchTransactions({
      limit: 1,
      sort: { field: "date", dir: "desc" },
    });
    const first = ts?.items?.[0] ?? ts?.transactions?.[0] ?? ts?.data?.[0] ?? null;
    const m =
      (first && typeof first.month === "string" && first.month) ||
      (first && typeof first.date === "string" && first.date.slice(0, 7)) ||
      null;
    console.debug("[boot] transactions.search returned:", first);
    if (m && m.length >= 7) {
      console.debug("[boot] transactions.search OK:", m);
      return m;
    }
  } catch (e) {
    console.debug("[boot] transactions.search failed:", e);
  }

  return null;
}

// === Reports (Excel/PDF) ===
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
  const base = (import.meta as any)?.env?.VITE_API_BASE || API_BASE || "";
  const url = new URL("/report/excel", base);
  if (month) url.searchParams.set("month", month);
  if (opts?.start) url.searchParams.set("start", opts.start);
  if (opts?.end) url.searchParams.set("end", opts.end);
  url.searchParams.set("include_transactions", String(includeTransactions));
  if (opts?.splitAlpha) url.searchParams.set("split_transactions_alpha", String(!!opts.splitAlpha));
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(`Excel export failed: ${res.status}`);
  const blob = await res.blob();
  const filename = parseDispositionFilename(res.headers.get("Content-Disposition")) || "finance_report.xlsx";
  return { blob, filename };
}

export async function downloadReportPdf(month?: string, opts?: { start?: string; end?: string }) {
  const base = (import.meta as any)?.env?.VITE_API_BASE || API_BASE || "";
  const url = new URL("/report/pdf", base);
  if (month) url.searchParams.set("month", month);
  if (opts?.start) url.searchParams.set("start", opts.start);
  if (opts?.end) url.searchParams.set("end", opts.end);
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(`PDF export failed: ${res.status}`);
  const blob = await res.blob();
  const filename = parseDispositionFilename(res.headers.get("Content-Disposition")) || "finance_report.pdf";
  return { blob, filename };
}

// ---------- Natural-language Transactions Query ----------
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
  return http<TxnQueryResult>("/agent/txns_query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q, ...opts }),
  });
}

// Download CSV for an NL transactions query. Server forces list intent and caps size.
export async function txnsQueryCsv(
  q: string,
  opts?: { start?: string; end?: string; page_size?: number; flow?: 'expenses'|'income'|'all' }
): Promise<{ blob: Blob; filename: string }> {
  const base = (import.meta as any)?.env?.VITE_API_BASE || API_BASE || "";
  const url = new URL("/agent/txns_query/csv", base);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q, ...opts }),
  });
  if (!res.ok) throw new Error(`CSV export failed: ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const filename = parseDispositionFilename(res.headers.get("Content-Disposition")) || "txns_query.csv";
  return { blob, filename };
}

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

// Remove a category from the anomalies ignore list
export const unignoreAnomaly = (category: string) =>
  http<{ ignored: string[] }>(`/insights/anomalies/ignore/${encodeURIComponent(category)}`, { method: "DELETE" });
