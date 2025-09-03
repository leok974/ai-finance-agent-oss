import React, { useEffect, useState } from 'react'
import Card from './Card'
import { getUnknowns, categorizeTxn } from '../lib/api'

export default function UnknownsPanel({ month, onSeedRule, onChanged, refreshKey }: {
  month: string
  onSeedRule?: (seed: { id: number; merchant?: string; description?: string }) => void
  onChanged?: () => void
  refreshKey?: number
}) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try { setItems(await getUnknowns(month)) } finally { setLoading(false) }
  }
  useEffect(()=>{ load() }, [month, refreshKey])

  async function quickApply(id: number, category: string) {
    await categorizeTxn(id, category)
    setItems(s => s.filter(x => x.id !== id))
    onChanged?.()
  }

  return (
    <Card title={`Unknowns — ${month}`} right={<span className="text-sm opacity-70">{items.length}</span>}>
      {loading && <div className="opacity-70">Loading…</div>}
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
              <button className="px-2 py-1 rounded bg-neutral-800" onClick={()=> onSeedRule?.({ id: tx.id, merchant: tx.merchant, description: tx.description })}>Seed rule</button>
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
