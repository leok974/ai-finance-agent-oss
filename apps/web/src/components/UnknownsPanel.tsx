import React, { useState, useMemo } from 'react'
import Card from './Card'
import EmptyState from './EmptyState'
import { mlFeedback, suggestForTxnBatch } from '@/api'
import SuggestionPill from '@/components/SuggestionPill'
import { useCoalescedRefresh } from '@/utils/refreshBus'
// removed useOkErrToast hook (deprecated)
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { InfoDot } from './InfoDot'
import LearnedBadge from './LearnedBadge'
import ExplainSignalDrawer from './ExplainSignalDrawer'
import { useUnknowns, type UnknownTxn } from '@/hooks/useUnknowns'
import { Skeleton } from '@/components/ui/skeleton'
import CardHelpTooltip from './CardHelpTooltip'
import { getHelpBaseText } from '@/lib/helpBaseText';
import { seedRuleFromTxn } from '@/lib/rulesSeed'
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers'
import { Button } from '@/components/ui/button'
import { useIsAdmin } from '@/state/auth'
import { t } from '@/lib/i18n'

export default function UnknownsPanel({ month, onSeedRule: _onSeedRule, onChanged, refreshKey: _refreshKey }: {
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
  const [explainTxn, setExplainTxn] = useState<UnknownTxn | null>(null)
  const [explainSuggestions, setExplainSuggestions] = useState<{ category_slug: string; label?: string; score: number; why?: string[] }[]>([])
  const [suggestions, setSuggestions] = useState<Record<number, { category_slug: string; label?: string; score: number; why?: string[] }[]>>({})
  const isAdmin = useIsAdmin()
  // One shared timer for all unknowns refresh requests across this tab
  const scheduleUnknownsRefresh = useCoalescedRefresh('unknowns-refresh', () => refresh(), 450)

  // Track dismissed transactions for immediate UI feedback
  const [dismissedTxnIds, setDismissedTxnIds] = useState<Set<number>>(new Set())
  const [applyingKey, setApplyingKey] = useState<string | null>(null)

  // (Quick apply is now handled via SuggestionPill.onApplied)

  function seedRuleFromRow(row: UnknownTxn) {
    const draft = seedRuleFromTxn({
      merchant: row.merchant ?? undefined,
      description: row.description ?? undefined,
    }, { month: currentMonth || month })
    // Provide a toast with an action to forcibly open (if listener not auto-opened)
    emitToastSuccess(t('ui.toast.seed_rule_title'), {
      description: t('ui.toast.seed_rule_description'),
      action: {
        label: t('ui.toast.seed_rule_action_open'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onClick: () => (window as any).__openRuleTester?.(draft),
      },
    })
  }

  // Batch load top suggestions for current rows
  React.useEffect(() => {
    const ids = items.map(x => x.id)
    if (!ids.length) { setSuggestions({}); return }
    let aborted = false
    suggestForTxnBatch(ids)
      .then(res => {
        if (aborted) return
        const map: Record<number, { category_slug: string; label?: string; score: number; why?: string[] }[]> = {}
        for (const it of res?.items || []) map[it.txn] = (it.suggestions || [])
        setSuggestions(map)
      })
      .catch(() => { if (!aborted) setSuggestions({}) })
    return () => { aborted = true }
  }, [items])

  const onSuggestionApplied = (id: number, category: string) => {
    console.log('[UnknownsPanel] onSuggestionApplied called:', { id, category })
    // 1) Immediately hide this txn from the UI
    setDismissedTxnIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      console.log('[UnknownsPanel] dismissedTxnIds updated:', Array.from(next))
      return next
    })

    // 2) Fire-and-forget feedback; don't block UI
    void (async () => {
      try {
        setLearned((prev) => ({ ...prev, [id]: true }))

        await mlFeedback({ txn_id: id, category, action: 'accept' })

        // Clear "learned" flag after a few seconds
        setTimeout(() => {
          setLearned((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
          })
        }, 4500)
      } catch (e: unknown) {
        // Undo dismiss on hard failure
        setDismissedTxnIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })

        const msg = e instanceof Error ? e.message : String(e)
        err(t('ui.toast.ml_feedback_failed', { error: msg }))
      }
    })()

    // 3) Let the rest of the app know it changed
    onChanged?.()
    ok?.(t('ui.toast.category_applied', { category }))

    // 4) Do NOT refresh - let the dismissal be client-side permanent
    // User can manually refresh the page if they want to see updated backend state
    // scheduleUnknownsRefresh is also skipped to prevent race conditions
  }

  const resolvedMonth = (currentMonth ?? month) || '(latest)'
  return (
  <section
    id="unknowns-panel"
    className="panel p-4 md:p-5 help-spot"
    data-explain-key="cards.unknowns"
  data-help-key="cards.unknowns"
  data-help-id={currentMonth || month}
    data-testid="uncat-card-root"
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
      {!loading && !error && items.filter((item) => !dismissedTxnIds.has(item.id)).length === 0 && (
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
        {(() => {
          const filtered = items.filter((item) => !dismissedTxnIds.has(item.id))
          console.log('[UnknownsPanel] Rendering:', {
            totalItems: items.length,
            dismissedIds: Array.from(dismissedTxnIds),
            filteredCount: filtered.length
          })
          return filtered.map(tx => (
            <li
              key={tx.id}
              className="panel-tight md:p-5 lg:p-6"
              data-testid="uncat-transaction-row"
            >
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
            <div className="mt-2 flex flex-wrap items-center gap-2 justify-between">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="pill-outline"
                    size="sm"
                    onClick={()=> seedRuleFromRow(tx)}
                    aria-label={t('ui.unknowns.seed_rule_aria')}
                    data-testid="uncat-seed-rule"
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
                onClick={() => {
                  setExplainTxnId(tx.id);
                  setExplainTxn(tx);
                  setExplainSuggestions(suggestions[tx.id] || []);
                  setExplainOpen(true);
                }}
              >
                {t('ui.unknowns.explain')}
              </Button>
              {([
                // Fallback quick picks can remain, but prefer dynamic suggestions below
              ] as const)}

              {/* Dynamic suggestions */}
              <div className="flex flex-wrap gap-2 justify-start">
                {Array.isArray(suggestions[tx.id]) && suggestions[tx.id].slice(0,3).map((sug, idx) => {
                  const key = `${tx.id}:${sug.category_slug}`;
                  return (
                    <SuggestionPill
                      key={`${tx.id}-sug-${idx}`}
                      txn={{ id: tx.id, merchant: tx.merchant || '', description: tx.description || '', amount: tx.amount }}
                      s={{ category_slug: sug.category_slug, label: sug.label || sug.category_slug, score: sug.score, why: sug.why || [] }}
                      disabled={applyingKey === key}
                      onApplied={(id: number, categorySlug: string) => onSuggestionApplied(id, categorySlug)}
                    />
                  );
                })}
              </div>

              {/* Promote moved inline next to each suggestion */}
              {learned[tx.id] && <LearnedBadge />}
            </div>
          </li>
          ))
        })()}
      </ul>
  <ExplainSignalDrawer
    txnId={explainTxnId}
    txn={explainTxn}
    suggestions={explainSuggestions}
    open={explainOpen}
    onOpenChange={(v)=>{ setExplainOpen(v); if(!v){ setExplainTxnId(null); setExplainTxn(null); setExplainSuggestions([]);} }}
  />
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
