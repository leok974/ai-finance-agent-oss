import React, { useEffect, useMemo, useState } from 'react'
import Card from './Card'
import { mlSuggest, categorizeTxn, getExplain } from '../lib/api'

type Suggestion = { txn_id: number; merchant?: string; description?: string; topk: Array<{ category: string; confidence: number }> }

export default function SuggestionsPanel({ month, refreshKey }: { month: string; refreshKey?: number }) {
  const [items, setItems] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(()=>{ (async()=>{
    setLoading(true)
    try {
      const res = await mlSuggest(month, 200, 3)
      // ensure dedup per txn and per category
      const src = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
      const clean: Suggestion[] = src.map((s: any) => ({
        txn_id: s.txn_id ?? s.id,
        merchant: s.merchant,
        description: s.description,
        topk: Array.from(new Map((s.topk ?? []).map((x:any)=>[x.category,x]))).map(([,v])=>v).slice(0,3)
      }))
      // coalesce by txn (one card per txn)
      const byTxn = new Map<number, Suggestion>()
      for (const s of clean) {
        const prev = byTxn.get(s.txn_id)
        if (!prev) { byTxn.set(s.txn_id, s); continue }
        const cats = new Map(prev.topk.map(x=>[x.category,x]))
        for (const t of s.topk) if (!cats.has(t.category)) cats.set(t.category,t)
        prev.topk = Array.from(cats.values()).slice(0,3)
      }
      setItems(Array.from(byTxn.values()))
    } finally { setLoading(false) }
  })() }, [month, refreshKey])

  const canApply = useMemo(()=> Object.keys(selected).length>0, [selected])

  async function applySelected() {
    const entries = Object.entries(selected)
    await Promise.all(entries.map(([id,cat])=>categorizeTxn(Number(id), cat)))
    setItems(list => list.filter(it => !(it.txn_id in selected)))
    setSelected({})
  }

  async function autoApplyBest(threshold=0.85) {
    const picks: Record<number,string> = {}
    for (const it of items) {
      const best = [...it.topk].sort((a,b)=>b.confidence-a.confidence)[0]
      if (best && best.confidence>=threshold) picks[it.txn_id] = best.category
    }
    const pairs = Object.entries(picks)
    if (!pairs.length) return
    await Promise.all(pairs.map(([id,cat])=>categorizeTxn(Number(id), cat)))
    setItems(list => list.filter(it => !(it.txn_id in picks)))
  }

  return (
    <Card title={`ML Suggestions — ${month}`} right={
      <div className="flex gap-2">
        <button className="px-2 py-1 rounded bg-blue-700 disabled:opacity-40" disabled={!canApply} onClick={applySelected}>Apply selected</button>
        <button className="px-2 py-1 rounded bg-emerald-700" onClick={()=>autoApplyBest(0.85)}>Auto‑apply best ≥ 0.85</button>
      </div>
    }>
      {loading && <div className="opacity-70">Loading…</div>}
      <ul className="space-y-2">
        {items.map(it => (
          <li key={it.txn_id} className="rounded-lg border border-neutral-800 p-3 bg-neutral-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium">{it.merchant ?? '—'}</div>
                <div className="text-sm opacity-70">{it.description ?? ''}</div>
              </div>
              <div className="flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {it.topk.map(opt => (
                    <label key={opt.category} className="flex items-center gap-2 rounded border border-neutral-800 p-2 bg-neutral-950">
                      <input type="radio" name={`pick-${it.txn_id}`} onChange={()=>setSelected(s=>({ ...s, [it.txn_id]: opt.category }))} />
                      <span className="flex-1">{opt.category}</span>
                      <span className="text-xs opacity-70">{(opt.confidence*100).toFixed(1)}%</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <button className="text-sm opacity-80 underline" onClick={async()=>{
                  const r = await getExplain(it.txn_id)
                  alert(r?.explanation ?? JSON.stringify(r))
                }}>Explain</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
