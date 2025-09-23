import React, { useState } from 'react'
import Card from './Card'
import EmptyState from './EmptyState'
import { categorizeTxn, mlFeedback } from '@/api'
import { useCoalescedRefresh } from '@/utils/refreshBus'
import { useOkErrToast } from '@/lib/toast-helpers'
import { ToastAction } from '@/components/ui/toast'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { InfoDot } from './InfoDot'
import LearnedBadge from './LearnedBadge'
import ExplainSignalDrawer from './ExplainSignalDrawer'
import { useUnknowns } from '@/hooks/useUnknowns'
import { Skeleton } from '@/components/ui/skeleton'
import HelpBadge from './HelpBadge'
import { seedRuleFromTxn } from '@/lib/rulesSeed'
import { emitToastSuccess } from '@/lib/toast-helpers'

export default function UnknownsPanel({ month, onSeedRule, onChanged, refreshKey }: {
  month?: string
  onSeedRule?: (seed: { id: number; merchant?: string; description?: string }) => void
  onChanged?: () => void
  refreshKey?: number
}) {
  const { items, loading, error, currentMonth, refresh } = useUnknowns(month)
  const { ok, err } = (useOkErrToast as any)?.() ?? { ok: console.log, err: console.error }
  const [learned, setLearned] = useState<Record<number, boolean>>({})
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainTxnId, setExplainTxnId] = useState<number | null>(null)
  // One shared timer for all unknowns refresh requests across this tab
  const scheduleUnknownsRefresh = useCoalescedRefresh('unknowns-refresh', () => refresh(), 450)

  async function quickApply(id: number, category: string) {
    await categorizeTxn(id, category)
    // Attempt ML feedback; show transient "learned" badge on success
    try {
      await mlFeedback({ txn_id: id, category, action: 'accept' })
      setLearned(prev => ({ ...prev, [id]: true }))
      setTimeout(() => {
        setLearned(prev => {
          const next = { ...prev }
          delete next[id]
          return next
        })
      }, 4500)
    } catch (e: any) {
      err(`ML feedback failed (${e?.message ?? String(e)}). DB updated.`)
    }
  // Optimistically remove the row
  // items comes from the hook; since we can't mutate it here, trigger a refresh
  refresh()
    onChanged?.()
  ok?.(`Set category → ${category}`)
  // Batch multiple quick applies into a single reload (coalesced by key)
  scheduleUnknownsRefresh()
  }

  function seedRuleFromRow(row: any) {
    const draft = seedRuleFromTxn({
      merchant: row.merchant,
      description: row.description,
      category_guess: row.category_guess,
    }, { month: currentMonth || month })
    // Provide a toast with an action to forcibly open (if listener not auto-opened)
    emitToastSuccess('Seeded into Rule Tester', {
      description: 'Merchant & description copied — adjust and test.',
      action: {
        label: 'Open tester',
        onClick: () => (window as any).__openRuleTester?.(draft),
      },
    })
  }

  const titleMonth = (currentMonth ?? month) ? `— ${currentMonth ?? month}` : '— (latest)'
  return (
  <section id="unknowns-panel" className="panel p-4 md:p-5" data-explain-key="cards.unknowns">
        <Card title={`Unknowns ${titleMonth}`} className="border-0 bg-transparent shadow-none p-0">
  {loading && (
        <div className="space-y-2">
          {[0,1,2].map(i => (
    <div key={i} className="panel-tight">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Skeleton className="h-7 w-20 rounded" />
                <Skeleton className="h-7 w-16 rounded" />
                <Skeleton className="h-7 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && error && <div className="text-sm text-rose-300">{error}</div>}
      {!loading && !error && items.length === 0 && (
        <EmptyState title="No transactions yet" note="Upload a CSV to view and categorize unknowns." />
      )}
      <div className="flex items-center justify-between mb-2 text-sm font-medium">
        <div className="flex items-center gap-2">
          <span className="flex items-center">
            Uncategorized transactions
            <HelpBadge k="cards.unknowns" className="ml-2" />
          </span>
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
      <li key={tx.id} className="panel-tight md:p-5 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{tx.merchant ?? '—'}</div>
        <div className="text-sm opacity-70 wrap">{tx.description ?? ''}</div>
              </div>
              <div className="text-right">
                <div className="text-sm opacity-70">{new Date(tx.date).toLocaleDateString()}</div>
                <div className="font-mono">{typeof tx.amount === 'number' ? `$${tx.amount.toFixed(2)}` : tx.amount}</div>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
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
              <button
                className="px-2 py-1 rounded-md border border-border hover:bg-accent/10"
                onClick={() => { setExplainTxnId(tx.id); setExplainOpen(true); }}
              >
                Explain
              </button>
              {['Groceries','Dining','Shopping'].map(c => (
                <button key={c} className="px-2 py-1 rounded bg-blue-700 hover:bg-blue-600" onClick={()=>quickApply(tx.id, c)}>
                  Apply {c}
                </button>
              ))}
              {learned[tx.id] && <LearnedBadge />}
            </div>
          </li>
        ))}
      </ul>
      <ExplainSignalDrawer txnId={explainTxnId} open={explainOpen} onOpenChange={setExplainOpen} />
      </Card>
    </section>
  )
}

// If you support bulk apply somewhere, prefer this pattern to batch network work and refresh once:
// for (const { id, cat } of items) {
//   await categorizeTxn(id, cat)
//   await mlFeedback({ txn_id: id, label: cat, source: 'bulk' }).catch(() => {})
// }
// ok(`Applied ${items.length} changes`)
// scheduleUnknownsRefresh()
