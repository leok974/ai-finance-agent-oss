// Resolve API base from env, with a dev fallback when running Vite on port 5173
const envBase = (import.meta as any)?.env?.VITE_API_BASE as string | undefined;
const devDefault =
  typeof window !== "undefined" && window.location?.port === "5173"
    ? "http://127.0.0.1:8000"
    : "";
export const API_BASE: string = (envBase && envBase.trim()) || devDefault;

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
  const url = API_BASE ? `${API_BASE}${path}` : path
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : (await res.text() as any)
}

// ---------- Reports / Insights / Alerts ----------
export const getReport = (month?: string) => http(`/report${q({ month })}`)
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
  if (!res.ok) throw new Error(text || `${url} failed: ${res.status}`);
  if (!ctype.includes("application/json")) {
    throw new Error(`Expected JSON, got: ${ctype.substring(0, 64)}`);
  }
  try { return JSON.parse(text); } catch {
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
export const mlTrain = (month?: string, passes=2) => http(`/ml/train${q({ month, passes })}`, { method: 'POST' })

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
