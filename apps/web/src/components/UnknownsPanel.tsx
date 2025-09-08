import React, { useEffect, useState } from 'react'
import Card from './Card'
import EmptyState from './EmptyState'
import { getUnknowns, categorizeTxn, sendFeedback } from '@/api'
import { setRuleDraft } from '@/state/rulesDraft'
import { getGlobalMonth } from '@/state/month'
import { useOkErrToast } from '@/lib/toast-helpers'
import { useToast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'
import { scrollToId } from '@/lib/scroll'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { InfoDot } from './InfoDot'

export default function UnknownsPanel({ month, onSeedRule, onChanged, refreshKey }: {
  month?: string
  onSeedRule?: (seed: { id: number; merchant?: string; description?: string }) => void
  onChanged?: () => void
  refreshKey?: number
}) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)
  const [resolvedMonth, setResolvedMonth] = useState<string | null>(null)
  const { err } = useOkErrToast()
  const { toast } = useToast()

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
      err('Could not fetch uncategorized transactions.', 'Failed to load')
    } finally { setLoading(false) }
  }
  useEffect(()=>{ load() }, [month, refreshKey])

  async function quickApply(id: number, category: string) {
  await categorizeTxn(id, category)
  // fire-and-forget feedback logging
  try { sendFeedback(id, category, 'user_change'); } catch {}
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
      // pass current global month so Rule Tester can honor it when toggle is off
      // (Rule Tester will sync to global month when toggle is on)
      month: getGlobalMonth() || undefined,
    } as any)
    // Dual CTA: open Rule Tester or jump to Charts
    toast({
      title: 'Seeded into Rule Tester',
      description: 'Merchant & description copied; adjust and test.',
      duration: 4000,
      action: (
        <div className="flex gap-2">
          <ToastAction altText="Open Rule Tester" onClick={() => scrollToId('rule-tester-anchor')}>
            Rule Tester
          </ToastAction>
          <ToastAction altText="View charts" onClick={() => scrollToId('charts-panel')}>
            View charts
          </ToastAction>
        </div>
      ),
    })
  }

  const titleMonth = (resolvedMonth ?? month) ? `— ${resolvedMonth ?? month}` : '— (latest)'
  return (
      <div id="unknowns-panel">
        <Card title={`Unknowns ${titleMonth}`}>
      {loading && <div className="opacity-70">Loading…</div>}
      {error && !empty && <div className="text-sm text-rose-300">{error}</div>}
      {empty && !error && (
        <EmptyState title="No transactions yet" note="Upload a CSV to view and categorize unknowns." />
      )}
      <div className="flex items-center justify-between mb-2 text-sm font-medium">
        <div className="flex items-center gap-2">
          <span>Uncategorized transactions</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoDot />
            </TooltipTrigger>
            <TooltipContent>
              These are transactions without a category. Use “Seed rule” to quickly create a rule in the Rule Tester.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="text-xs opacity-70">Review → Seed → Categorize</div>
      </div>
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="btn btn-sm hover:bg-accent"
                    onClick={()=> seedRuleFromRow(tx)}
                    aria-label="Seed rule (prefill Rule Tester)"
                  >
                    Seed rule
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Sends merchant/description (and current month) into Rule Tester so you can test & save a rule quickly.
                </TooltipContent>
              </Tooltip>
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
    </div>
  )
}
