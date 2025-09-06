import React, { useEffect, useMemo, useState } from 'react'
import Card from './Card'
import { getSuggestions, categorizeTxn, agentChat } from '../lib/api'
import EmptyState from './EmptyState'
import { useChatDock } from '../context/ChatDockContext'

type Suggestion = { txn_id: number; merchant?: string; description?: string; topk: Array<{ category: string; confidence: number }> }

export default function SuggestionsPanel({ month, refreshKey = 0 }: { month?: string; refreshKey?: number }) {
  const [items, setItems] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedMonth, setResolvedMonth] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)
  const chat = useChatDock()

  useEffect(()=>{ (async()=>{
    setLoading(true); setError(null); setEmpty(false)
    try {
      const res = await getSuggestions(month)
      // empty boot state
      if (!res) { setEmpty(true); setItems([]); setResolvedMonth(null); return }
      setResolvedMonth(res?.month ?? null)
      // normalize various server shapes -> list of { txn_id, merchant, description, topk[] }
      const arr: any[] = Array.isArray(res?.results)
        ? res.results
        : Array.isArray(res?.items)
        ? res.items
        : Array.isArray(res?.suggestions)
        ? res.suggestions
        : Array.isArray(res)
        ? res
        : []
      // map to Suggestion shape
      const mapped: Suggestion[] = arr.map((s: any) => {
        const txn = s.txn || s.txn_obj || s
        const suggs = s.suggestions || s.topk || []
        const dedup = new Map<string, any>((suggs ?? []).map((x: any) => [String(x.category), x]))
        const topk = Array.from(dedup.values()).slice(0, 3).map((v: any) => ({
          category: String(v.category),
          confidence: Number(v.confidence ?? v.score ?? 0)
        }))
        return {
          txn_id: txn?.txn_id ?? txn?.id ?? s.txn_id ?? s.id,
          merchant: txn?.merchant ?? s.merchant,
          description: txn?.description ?? s.description,
          topk
        }
      })
      // coalesce by txn (one card per txn)
      const byTxn = new Map<number, Suggestion>()
      for (const s of mapped) {
        const prev = byTxn.get(s.txn_id)
        if (!prev) { byTxn.set(s.txn_id, s); continue }
        const cats = new Map(prev.topk.map(x=>[x.category,x]))
        for (const t of s.topk) if (!cats.has(t.category)) cats.set(t.category,t)
        prev.topk = Array.from(cats.values()).slice(0,3)
      }
      setItems(Array.from(byTxn.values()))
    } catch (e: any) {
      setError(e?.message ?? String(e))
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
  <Card title={`ML Suggestions — ${resolvedMonth ?? '(latest)'}`} right={
      <div className="flex gap-2">
        <button className="px-2 py-1 rounded bg-blue-700 disabled:opacity-40" disabled={!canApply} onClick={applySelected}>Apply selected</button>
        <button className="px-2 py-1 rounded bg-emerald-700" onClick={()=>autoApplyBest(0.85)}>Auto‑apply best ≥ 0.85</button>
      </div>
    }>
      {loading && <div className="opacity-70">Loading…</div>}
      {error && !empty && <p className="text-sm text-rose-300">Error: {error}</p>}
      {empty && !error && (
        <EmptyState title="No suggestions yet" note="Upload a CSV to generate category/merchant suggestions." />
      )}
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
                  try {
                    chat.appendUser?.(`Explain transaction ${it.txn_id}`)
                    const resp = await agentChat({
                      messages: [{ role: 'user', content: `Explain transaction ${it.txn_id} and suggest one action.` }],
                      intent: 'explain_txn',
                      txn_id: String(it.txn_id)
                    });
                    chat.appendAssistant?.(resp.reply, { meta: { citations: resp.citations, ctxMonth: resp.used_context?.month, trace: resp.tool_trace, model: resp.model } })
                  } catch (e: any) {
                    chat.appendAssistant?.(`(Error) ${e?.message ?? String(e)}`)
                  }
                }}>Explain</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {!loading && !error && !empty && items.length === 0 && (
        <p className="text-sm text-gray-400">No suggestions.</p>
      )}
    </Card>
  )
}
