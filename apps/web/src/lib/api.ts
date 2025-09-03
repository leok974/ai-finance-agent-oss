import axios from 'axios'

const BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000'

function q(params: Record<string, any>){
  const s = new URLSearchParams()
  Object.entries(params).forEach(([k,v])=>{ if(v!==undefined && v!==null && v!=='') s.append(k, String(v)) })
  const qs = s.toString()
  return qs ? `?${qs}` : ''
}

export async function uploadCsv(file: File){
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await axios.post(`${BASE}/ingest`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  return data
}

export async function getReport(month: string){
  const { data } = await axios.get(`${BASE}/report${q({month})}`)
  return data
}

export async function getUnknowns(month: string){
  const { data } = await axios.get(`${BASE}/txns/unknown${q({month})}`)
  return data
}

export async function categorize(txnId: number, category: string){
  const { data } = await axios.post(`${BASE}/txns/${txnId}/categorize`, { category })
  return data
}

export async function mlSuggest(month: string, limit=50, topk=3){
  const { data } = await axios.get(`${BASE}/ml/suggest${q({month,limit,topk})}`)
  return data
}

export async function explain(txnId: number){
  const { data } = await axios.get(`${BASE}/txns/${txnId}/explain`)
  return data
}
