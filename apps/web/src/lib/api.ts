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

// tiny mapper: pick and rename fields (camelCase -> snake_case)
const pick = <T extends object>(obj: any, map: Record<string, string>) => {
  const out: any = {};
  for (const [from, to] of Object.entries(map)) {
    if (obj?.[from] !== undefined) out[to] = obj[from];
    if (obj?.[to]   !== undefined) out[to] = obj[to]; // allow snake_case too
  }
  return out as T;
};

// ---------- Reports / Insights / Alerts ----------
// Legacy /report removed: map to agent tools insights summary and require month
export const getReport = (month: string) =>
  http(`/agent/tools/insights/summary`, {
    method: "POST",
    body: JSON.stringify({ month, include_unknown_spend: true, limit_large_txns: 10 }),
  })
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
export const getRules = () => http(`/rules`)
export const listRules = () => http(`/rules`)
export const addRule = (rule: any) => http(`/rules`, { method: 'POST', body: JSON.stringify(rule) })
export const deleteRule = (id: number) => http(`/rules/${id}`, { method: 'DELETE' })
export const clearRules = () => http(`/rules`, { method: 'DELETE' })
export const testRule = (seed: any) => http(`/rules/test`, { method: 'POST', body: JSON.stringify(seed) })

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

// ---------- Explain & Agent ----------
export const getExplain = (txnId: number) => http(`/txns/${txnId}/explain`)
export async function explainTxn(id: number) {
  return fetchJson(`/txns/explain?id=${id}`);
}

export async function agentStatus() {
  return fetchJson(`/agent/status`).catch(() => ({}));
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function agentChat(
  input: string | ChatMessage[],
  opts?: { system?: string }
) {
  let messages: ChatMessage[];
  if (Array.isArray(input)) {
    messages = input;
  } else {
    messages = [];
    if (opts?.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: input });
  }

  return fetchJson(`/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
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
export async function uploadCsv(file: File, replace = true) {
  const form = new FormData();
  form.append("file", file, file.name);
  return fetchJson(`/ingest?replace=${replace ? "true" : "false"}`, {
    method: "POST",
    body: form,
  });
}

// ---------- Agent Tools (Transactions, Budget, Insights, Charts, Rules) ----------
// Generic POST helper for Agent Tools (reuses existing http() which handles API_BASE and JSON headers)
async function postTool<T = any>(path: string, payload: any, init?: RequestInit): Promise<T> {
  return http<T>(path, { method: "POST", body: JSON.stringify(payload), ...(init || {}) });
}

// Namespaced helpers for agent tool endpoints
export const agentTools = {
  // Transactions
  searchTransactions: (payload: {
    month?: string;
    limit?: number;
    offset?: number;
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
  insightsSummary: (payload: {
    month?: string;
    limitLargeTxns?: number;      // camel
    includeUnknownSpend?: boolean;// camel
    // also accept snake_case to be flexible
    limit_large_txns?: number;
    include_unknown_spend?: boolean;
  }, signal?: AbortSignal) => postTool("/agent/tools/insights/summary", {
    month: payload?.month,
    ...pick(payload, {
      limitLargeTxns: "limit_large_txns",
      includeUnknownSpend: "include_unknown_spend",
    }),
  }, { signal }),

  insightsExpanded: (payload: { month?: string; large_limit?: number; largeLimit?: number }, signal?: AbortSignal) =>
    postTool("/agent/tools/insights/expanded", {
      month: payload?.month,
      ...pick(payload, { largeLimit: "large_limit" }),
    }, { signal }),

  // Charts
  chartsSummary: (payload: { month: string }, signal?: AbortSignal) =>
    postTool("/agent/tools/charts/summary", payload, { signal }),

  chartsMerchants: (payload: { month: string; limit?: number }, signal?: AbortSignal) =>
    postTool("/agent/tools/charts/merchants", payload, { signal }),

  chartsFlows: (payload: { month: string }, signal?: AbortSignal) =>
    postTool("/agent/tools/charts/flows", payload, { signal }),

  chartsSpendingTrends: (payload: { month: string; monthsBack?: number }, signal?: AbortSignal) =>
    postTool("/agent/tools/charts/spending_trends", payload, { signal }),

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
// Calls charts summary without a month; backend will respond with the resolved month.
export async function fetchLatestMonth(): Promise<string | null> {
  try {
    // Use transactions.search without month; backend resolves to latest and echoes `month`
    const res: any = await agentTools.searchTransactions({ limit: 1 });
    return typeof res?.month === "string" ? res.month : null;
  } catch {
    return null;
  }
}
