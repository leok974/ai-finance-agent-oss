import React, { useState } from 'react'
import Card from './Card'
import EmptyState from './EmptyState'
import { categorizeTxn, mlFeedback } from '@/api'
import { useCoalescedRefresh } from '@/utils/refreshBus'
// removed useOkErrToast hook (deprecated)
import { ToastAction } from '@/components/ui/toast'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { InfoDot } from './InfoDot'
import LearnedBadge from './LearnedBadge'
import ExplainSignalDrawer from './ExplainSignalDrawer'
import { useUnknowns } from '@/hooks/useUnknowns'
import { Skeleton } from '@/components/ui/skeleton'
import CardHelpTooltip from './CardHelpTooltip'
import { getHelpBaseText } from '@/lib/helpBaseText';
import { seedRuleFromTxn } from '@/lib/rulesSeed'
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'

export default function UnknownsPanel({ month, onSeedRule, onChanged, refreshKey }: {
  month?: string
  onSeedRule?: (seed: { id: number; merchant?: string; description?: string }) => void
  onChanged?: () => void
  refreshKey?: number
}) {
  const { items, loading, error, currentMonth, refresh } = useUnknowns(month)
  const ok = emitToastSuccess; const err = emitToastError;
  const [learned, setLearned] = useState<Record<number, boolean>>({})
  const [explainOpen, setExplainOpen] = useState(false)
  const [explainTxnId, setExplainTxnId] = useState<number | null>(null)
  const [explainTxn, setExplainTxn] = useState<any | null>(null)
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
  err(t('ui.toast.ml_feedback_failed', { error: e?.message ?? String(e) }))
    }
  // Optimistically remove the row
  // items comes from the hook; since we can't mutate it here, trigger a refresh
  refresh()
    onChanged?.()
  ok?.(t('ui.toast.category_applied', { category }))
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
    emitToastSuccess(t('ui.toast.seed_rule_title'), {
      description: t('ui.toast.seed_rule_description'),
      action: {
        label: t('ui.toast.seed_rule_action_open'),
        onClick: () => (window as any).__openRuleTester?.(draft),
      },
    })
  }

  const resolvedMonth = (currentMonth ?? month) || '(latest)'
  return (
  <section
    id="unknowns-panel"
    className="panel p-4 md:p-5 help-spot"
    data-explain-key="cards.unknowns"
  data-help-key="cards.unknowns"
  data-help-id={currentMonth || month}
  >
  <Card title={t('ui.cards.unknowns_title', { month: resolvedMonth })} className="border-0 bg-transparent shadow-none p-0">
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
        <EmptyState title={t('ui.empty.no_transactions_title')} note={t('ui.empty.unknowns_note')} />
      )}
      <div className="flex items-center justify-between mb-2 text-sm font-medium">
        <div className="flex items-center gap-2">
          <span className="flex items-center">
            {t('ui.unknowns.header_label')}
            <CardHelpTooltip cardId="cards.unknowns" month={currentMonth || month} ctx={{ items }} baseText={getHelpBaseText('cards.unknowns', { month: currentMonth || month })} className="ml-2" />
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoDot />
            </TooltipTrigger>
            <TooltipContent>
              {t('ui.unknowns.tooltip_info')}
            </TooltipContent>
          </Tooltip>
        </div>
  <div className="text-xs opacity-70">{t('ui.unknowns.workflow_hint')}</div>
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
                  <Button
                    type="button"
                    variant="pill-outline"
                    size="sm"
                    onClick={()=> seedRuleFromRow(tx)}
                    aria-label={t('ui.unknowns.seed_rule_aria')}
                  >
                    {t('ui.unknowns.seed_rule')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t('ui.unknowns.seed_rule_tooltip')}
                </TooltipContent>
              </Tooltip>
              <Button
                variant="pill-outline"
                size="sm"
                onClick={() => { setExplainTxnId(tx.id); setExplainTxn(tx); setExplainOpen(true); }}
              >
                {t('ui.unknowns.explain')}
              </Button>
              {([
                { key: 'groceries', label: t('ui.categories.groceries') },
                { key: 'dining', label: t('ui.categories.dining') },
                { key: 'shopping', label: t('ui.categories.shopping') },
              ] as const).map(c => (
                <button key={c.key} className="px-2 py-1 rounded bg-blue-700 hover:bg-blue-600" onClick={()=>quickApply(tx.id, c.label)}>
                  {t('ui.unknowns.apply_category', { category: c.label })}
                </button>
              ))}
              {learned[tx.id] && <LearnedBadge />}
            </div>
          </li>
        ))}
      </ul>
  <ExplainSignalDrawer txnId={explainTxnId} txn={explainTxn} open={explainOpen} onOpenChange={(v)=>{ setExplainOpen(v); if(!v){ setExplainTxnId(null); setExplainTxn(null);} }} />
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
