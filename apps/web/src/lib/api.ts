const API_BASE: string = (globalThis as any).__API_BASE__ ?? 'http://127.0.0.1:8000'

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
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const ct = res.headers.get('content-type') || ''
  return ct.includes('application/json') ? res.json() : (await res.text() as any)
}

// ---------- Reports / Insights / Alerts ----------
export const getReport = (month?: string) => http(`/report${q({ month })}`)
export const getInsights = (month?: string) => http(`/insights${q({ month })}`)
export const getAlerts = (month?: string) => http(`/alerts${q({ month })}`)
export const downloadReportCsv = (month: string) => window.open(`${API_BASE}/report_csv${q({ month })}`,'_blank')

// ---------- Charts ----------
export const getMonthSummary = (month: string) => http(`/month_summary${q({ month })}`)
export const getMonthMerchants = (month: string) => http(`/month_merchants${q({ month })}`)
export const getMonthFlows = (month: string) => http(`/month_flows${q({ month })}`)

// ---------- Budgets ----------
export const budgetCheck = (month: string) => http(`/budget/check${q({ month })}`)

// ---------- Unknowns / Txns ----------
export const getUnknowns = (month: string, limit=200) => http(`/txns/unknown${q({ month, limit })}`)
export const categorizeTxn = (id: number, category: string) => http(`/txns/${id}/categorize`, { method: 'POST', body: JSON.stringify({ category }) })

// ---------- Rules ----------
export const listRules = () => http(`/rules`)
export const addRule = (rule: any) => http(`/rules`, { method: 'POST', body: JSON.stringify(rule) })
export const deleteRule = (id: number) => http(`/rules/${id}`, { method: 'DELETE' })
export const testRule = (seed: any) => http(`/rules/test`, { method: 'POST', body: JSON.stringify(seed) })

// ---------- ML ----------
export const mlSuggest = (month: string, limit=100, topk=3) => http(`/ml/suggest${q({ month, limit, topk })}`)
export const mlTrain = (month?: string, passes=2) => http(`/ml/train${q({ month, passes })}`, { method: 'POST' })

// ---------- Explain & Agent ----------
export const getExplain = (txnId: number) => http(`/txns/${txnId}/explain`)
export const agentChat = (message: string, context?: any) => http(`/agent/chat`, { method: 'POST', body: JSON.stringify({ message, context }) })

// ---------- CSV ingest ----------
export async function uploadCsv(file: File, replace=true) {
  const form = new FormData()
  form.set('file', file)
  const res = await fetch(`${API_BASE}/ingest${q({ replace })}`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}
