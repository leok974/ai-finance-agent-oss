// Resolve API base from env, with a dev fallback when running Vite on port 5173
export const API_BASE = (import.meta as any)?.env?.VITE_API_BASE
  || (typeof window !== "undefined" && window.location?.port === "5173" ? "http://127.0.0.1:8000" : "");

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
async function fetchJson(path: string, init?: RequestInit) {
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const res = await fetch(url, init);
  const text = await res.text();
  const ctype = res.headers.get("content-type") || "";
  if (!res.ok) {
    if (res.status === 400 && /No transactions loaded/i.test(text)) {
      // allow panels to render gracefully when backend has no data yet
      return null;
    }
    throw new Error(text || `${url} failed: ${res.status}`);
  }
  if (!ctype.includes("application/json")) {
    throw new Error(`Expected JSON, got: ${ctype}`);
  }
  try { return JSON.parse(text || "null"); } catch {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 120)}`);
  }
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

// If you have explain/categorize helpers, keep them as-is
export const categorizeTxn = (id: number, category: string) => http(`/txns/${id}/categorize`, { method: 'POST', body: JSON.stringify({ category }) })

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

export type RuleTestResult = {
  matched_count: number;
  sample: Array<{
    id: number;
    date: string;
    merchant?: string;
    description?: string;
    amount: number;
    category?: string | null;
  }>;
};

export const getRules = () => http<Rule[]>(`/rules`);
export const listRules = getRules;
export const addRule = (rule: RuleInput) => http<Rule>(`/rules`, { method: 'POST', body: JSON.stringify(rule) });
export const deleteRule = (id: number) => http(`/rules/${id}`, { method: 'DELETE' });
export const clearRules = () => http(`/rules`, { method: 'DELETE' });
export const testRule = (seed: RuleInput, month?: string) =>
  http<RuleTestResult>(`/rules/test${month ? `?month=${encodeURIComponent(month)}` : ''}`,
    { method: 'POST', body: JSON.stringify(seed) }
  );

// Enhanced createRule with richer FastAPI error reporting (e.g., 422 validation errors)
export async function createRule(body: RuleInput): Promise<Rule> {
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
  return r.json();
}
export const updateRule = (id: number, patch: Partial<RuleInput>) =>
  http<Rule>(`/rules/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });

// ---------- ML ----------
export const mlSuggest = (month: string, limit=100, topk=3) => http(`/ml/suggest${q({ month, limit, topk })}`)
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

// One-click: Save → Train → Reclassify
export async function saveTrainReclassify(rule: RuleInput, month?: string) {
  const saved = await createRule(rule);
  const trained = await trainModel({ min_samples: 6, test_size: 0.2 });
  let reclass: { status: string } | null = null;
  try {
    reclass = await reclassifyAll(month);
  } catch {
    reclass = null; // soft-fail if endpoint not present
  }
  return { saved, trained, reclass };
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
  reply: string;
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
