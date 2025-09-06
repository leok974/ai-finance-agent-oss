import React, { useEffect, useState } from 'react'
import Card from './Card'
import { getUnknowns, categorizeTxn } from '../lib/api'
import EmptyState from './EmptyState'
import { setRuleDraft } from '../state/rulesDraft'
import { useToast } from './Toast'

export default function UnknownsPanel({ month, onSeedRule, onChanged, refreshKey }: {
  month?: string
  onSeedRule?: (seed: { id: number; merchant?: string; description?: string }) => void
  onChanged?: () => void
  refreshKey?: number
}) {
  const { push } = useToast();
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)
  const [resolvedMonth, setResolvedMonth] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    setEmpty(false)
    try {
      const data = await getUnknowns(month)
      if (!data) {
        setEmpty(true)
        setItems([])
        setResolvedMonth(null)
      } else {
        const rows = Array.isArray(data) ? data : (data as any)?.unknowns ?? data ?? []
        setItems(rows)
        const m = (data as any)?.month
        setResolvedMonth(typeof m === 'string' ? m : (month ?? null))
      }
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally { setLoading(false) }
  }
  useEffect(()=>{ load() }, [month, refreshKey])

  async function quickApply(id: number, category: string) {
    await categorizeTxn(id, category)
    setItems(s => s.filter(x => x.id !== id))
    onChanged?.()
  }

  function seedRuleFromRow(row: any) {
    const name = String(row.merchant || row.description || 'New Rule').slice(0, 40)
    const description_like = String(row.merchant || row.description || '').slice(0, 64)
    setRuleDraft({
      name,
      enabled: true,
      when: { description_like },
      then: { category: '' },
    })
    push({ title: 'Rule draft sent', message: 'Open Rule Tester to review and save.' })
    const el = document.querySelector('#rule-tester-anchor')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const titleMonth = (resolvedMonth ?? month) ? `— ${resolvedMonth ?? month}` : '— (latest)'
  return (
    <Card title={`Unknowns ${titleMonth}`} right={<span className="text-sm opacity-70">{items.length}</span>}>
      {loading && <div className="opacity-70">Loading…</div>}
      {error && !empty && <div className="text-sm text-rose-300">{error}</div>}
      {empty && !error && (
        <EmptyState title="No transactions yet" note="Upload a CSV to view and categorize unknowns." />
      )}
      <ul className="space-y-2">
        {items.map(tx => (
          <li key={tx.id} className="rounded-lg border border-neutral-800 p-3 bg-neutral-900">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{tx.merchant ?? '—'}</div>
                <div className="text-sm opacity-70">{tx.description ?? ''}</div>
              </div>
              <div className="text-right">
                <div className="text-sm opacity-70">{new Date(tx.date).toLocaleDateString()}</div>
                <div className="font-mono">{typeof tx.amount === 'number' ? `$${tx.amount.toFixed(2)}` : tx.amount}</div>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <button className="px-2 py-1 rounded bg-neutral-800" onClick={()=> seedRuleFromRow(tx)}>Seed rule</button>
              {['Groceries','Dining','Shopping'].map(c => (
                <button key={c} className="px-2 py-1 rounded bg-blue-700 hover:bg-blue-600" onClick={()=>quickApply(tx.id, c)}>
                  Apply {c}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
