import React, { useEffect, useMemo, useState } from 'react'
import Card from './Card'
import { getSuggestions, categorizeTxn, agentChat, autoApplySuggestions } from '@/api'
import EmptyState from './EmptyState'
import { useChatDock } from '../context/ChatDockContext'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'
import { scrollToId } from '@/lib/scroll'
import { InfoDot } from './InfoDot'

type Suggestion = { txn_id: number; merchant?: string; description?: string; topk: Array<{ category: string; confidence: number }> }

export default function SuggestionsPanel({ month, refreshKey = 0 }: { month?: string; refreshKey?: number }) {
  const [items, setItems] = useState<Suggestion[]>([])
  // Radio picks: txn_id -> chosen category
  const [selected, setSelected] = useState<Record<number, string>>({})
  // Row checkboxes for bulk actions
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedMonth, setResolvedMonth] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)
  const chat = useChatDock()
  const { toast } = useToast()

  async function refresh() {
    setLoading(true); setError(null); setEmpty(false)
    try {
      const res = await getSuggestions(month)
      if (!res) { setEmpty(true); setItems([]); setResolvedMonth(null); return }
      setResolvedMonth(res?.month ?? null)
      const arr: any[] = Array.isArray(res?.results)
        ? res.results
        : Array.isArray(res?.items)
        ? res.items
        : Array.isArray(res?.suggestions)
        ? res.suggestions
        : Array.isArray(res)
        ? res
        : []
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
  }

  useEffect(()=>{ refresh() }, [month, refreshKey])

  const canApply = useMemo(()=> selectedRows.size > 0 || Object.keys(selected).length>0, [selectedRows, selected])

  async function applySelected() {
    // Prefer explicitly checked rows; otherwise fall back to any radio selections
    const targetIds: number[] = selectedRows.size > 0
      ? Array.from(selectedRows)
      : Object.keys(selected).map(k => Number(k))
    if (targetIds.length === 0) return

    // Resolve category per row: use radio pick; else choose best suggestion by confidence
    const toApply: Array<[number,string]> = []
    for (const id of targetIds) {
      const picked = selected[id]
      if (picked) { toApply.push([id, picked]); continue }
      const row = items.find(r => r.txn_id === id)
      if (row && row.topk?.length) {
        const best = [...row.topk].sort((a,b)=>b.confidence-a.confidence)[0]
        if (best?.category) toApply.push([id, best.category])
      }
    }
    if (!toApply.length) return

    await Promise.all(toApply.map(([id,cat])=>categorizeTxn(Number(id), cat)))
    const applied = new Set(toApply.map(([id])=>id))
    setItems(list => list.filter(it => !applied.has(it.txn_id)))
    // Clear selection state for applied rows
    setSelectedRows(prev => {
      const next = new Set(prev)
      for (const id of applied) next.delete(id)
      return next
    })
    setSelected(prev => {
      const next: Record<number,string> = { ...prev }
      for (const id of applied) delete (next as any)[id]
      return next
    })
    // Success toast with CTAs
    if (toApply.length > 0) {
      toast({
        title: 'Suggestions applied',
        description: `Applied ${toApply.length} suggestion${toApply.length === 1 ? '' : 's'}.`,
        duration: 4000,
        action: (
          <div className="flex gap-2">
            <ToastAction altText="View unknowns" onClick={() => scrollToId('unknowns-panel')}>
              View unknowns
            </ToastAction>
            <ToastAction altText="View charts" onClick={() => scrollToId('charts-panel')}>
              View charts
            </ToastAction>
          </div>
        ),
      })
    }
  }

  async function autoApplyBest(threshold=0.85) {
    try {
      // If backend endpoint exists, prefer server-side auto-apply to ensure consistency
      const res = await autoApplySuggestions({ threshold, month })
      const applied = Number((res as any)?.applied ?? (res as any)?.updated ?? 0) || 0
      // Optimistically refresh suggestions; they should shrink
      await refresh()
      toast({
        title: 'Auto-applied best suggestions',
        description: applied > 0
          ? `Applied ${applied} high-confidence suggestion${applied === 1 ? '' : 's'}.`
          : 'No suggestions met the threshold.',
        duration: 4000,
        action: (
          <div className="flex gap-2">
            <ToastAction altText="View unknowns" onClick={() => scrollToId('unknowns-panel')}>
              View unknowns
            </ToastAction>
            <ToastAction altText="View charts" onClick={() => scrollToId('charts-panel')}>
              View charts
            </ToastAction>
          </div>
        ),
      })
    } catch {
      // Fallback to client-side auto-apply if server endpoint is absent
      const picks: Record<number,string> = {}
      for (const it of items) {
        const best = [...it.topk].sort((a,b)=>b.confidence-a.confidence)[0]
        if (best && best.confidence>=threshold) picks[it.txn_id] = best.category
      }
      const pairs = Object.entries(picks)
      if (!pairs.length) return
      await Promise.all(pairs.map(([id,cat])=>categorizeTxn(Number(id), cat)))
      setItems(list => list.filter(it => !(it.txn_id in picks)))
      toast({
        title: 'Auto-applied best suggestions',
        description: `Applied ${pairs.length} high-confidence suggestion${pairs.length === 1 ? '' : 's'}.`,
        duration: 4000,
        action: (
          <div className="flex gap-2">
            <ToastAction altText="View unknowns" onClick={() => scrollToId('unknowns-panel')}>
              View unknowns
            </ToastAction>
            <ToastAction altText="View charts" onClick={() => scrollToId('charts-panel')}>
              View charts
            </ToastAction>
          </div>
        ),
      })
    }
  }

  return (
  <Card title={
      <div className="flex items-center gap-2">
        <span>ML Suggestions — {resolvedMonth ?? '(latest)'}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoDot />
          </TooltipTrigger>
          <TooltipContent>
            ML-powered category suggestions for your uncategorized transactions. Pick one per row or auto-apply high-confidence matches.
          </TooltipContent>
        </Tooltip>
      </div>
    } right={
      <div className="flex items-center gap-2 flex-wrap">
  <button
          onClick={refresh}
          className="btn btn-sm hover:bg-accent w-full sm:w-auto"
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
  <button className="btn btn-sm w-full sm:w-auto hover:bg-accent" disabled={!canApply} onClick={applySelected}>Apply selected</button>
  <button className="btn btn-sm w-full sm:w-auto hover:bg-accent" title="Automatically apply high-confidence suggestions" onClick={()=>autoApplyBest(0.85)}>Auto‑apply best ≥ 0.85</button>
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
              <div className="flex items-start gap-3 min-w-0">
                <input
                  type="checkbox"
                  className="mt-1 accent-foreground shrink-0"
                  checked={selectedRows.has(it.txn_id)}
                  onChange={(e) => {
                    setSelectedRows(prev => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(it.txn_id); else next.delete(it.txn_id)
                      return next
                    })
                  }}
                  aria-label={`Select transaction ${it.txn_id}`}
                />
                <div className="min-w-0">
                  <div className="font-medium truncate">{it.merchant ?? '—'}</div>
                  <div className="text-sm opacity-70 truncate">{it.description ?? ''}</div>
                </div>
              </div>
              <div className="flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {it.topk.map(opt => (
                    <label key={opt.category} className="flex items-center gap-2 rounded border border-neutral-800 p-2 bg-neutral-950">
                      <input type="radio" name={`pick-${it.txn_id}`} onChange={()=>setSelected(s=>({ ...s, [it.txn_id]: opt.category }))} />
                      <span className="flex-1 truncate">{opt.category}</span>
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
