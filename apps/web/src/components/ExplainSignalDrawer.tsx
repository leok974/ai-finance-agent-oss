import * as React from 'react'
import { getExplain, type ExplainResponse, rejectSuggestion, undoRejectSuggestion } from '@/api'
import type { Transaction } from '@/types/agent'
import Chip from '@/components/ui/chip'
import { Skeleton } from '@/components/ui/skeleton'
import { selectTopMerchantCat } from '@/selectors/explain'
import ReactDOM from 'react-dom';
import { getPortalRoot } from '@/lib/portal';
import { buildDeterministicExplain } from '@/lib/explainFallback'
import Pill from '@/components/ui/pill'
import { useSafePortalReady } from '@/hooks/useSafePortal'
import { getSuggestionConfidencePercent } from '../lib/suggestions';
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers'
import { t } from '@/lib/i18n'
import {
  manualCategorizeTransaction,
  manualCategorizeUndo,
  type ManualCategorizeScope,
  type ManualCategorizeResponse,
} from '@/lib/http'
import { CATEGORY_OPTIONS, CATEGORY_DEFS } from '@/lib/categories'
import { Button } from '@/components/ui/button'
import type { UnknownTxn } from '@/hooks/useUnknowns'

function GroundedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-border bg-accent/10">
      <span className="w-2 h-2 rounded-full border border-current" /> grounded
    </span>
  )
}


type SuggestionItem = {
  category_slug: string
  label?: string
  score: number
  why?: string[]
}

/**
 * Convert raw backend reason strings into human-readable explanations
 */
function formatSuggestionReason(reasons?: string[]): string {
  if (!reasons || reasons.length === 0) {
    return "Suggested as a possible fit based on available data.";
  }

  // Check for specific known patterns
  const raw = reasons[0].toLowerCase();

  if (raw.includes('prior') && raw.includes('fallback')) {
    return "Low-confidence fallback suggestion based on previous patterns for this merchant.";
  }

  if (raw.includes('merchant') && raw.includes('rule')) {
    return "Deterministic rule: this merchant is usually treated as this category.";
  }

  if (raw.includes('p2p') || raw.includes('transfer')) {
    return "Looks like a person-to-person transfer based on the description and amount.";
  }

  if (raw.includes('model') || raw.includes('ml') || raw.includes('score')) {
    return "Suggested by our model based on the transaction description and amount.";
  }

  // If the backend already sent human-readable text (not a slug), use it
  if (reasons[0].length > 30 || reasons[0].includes(' ')) {
    return reasons.join(' ');
  }

  // Generic fallback
  return "Suggested as a possible fit. Treat this as a hint, not a final answer.";
}

export default function ExplainSignalDrawer({ txnId, open, onOpenChange, txn, suggestions, onRefresh, unknowns }: {
  txnId: number | null
  open: boolean
  onOpenChange: (v: boolean) => void
  txn?: any
  suggestions?: SuggestionItem[]
  onRefresh?: () => void
  unknowns?: UnknownTxn[]
}) {
  const portalReady = useSafePortalReady();
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [llmUnavailable, setLlmUnavailable] = React.useState(false)
  const [data, setData] = React.useState<ExplainResponse | null>(null)
  const [rejectingId, setRejectingId] = React.useState<string | null>(null)
  const [rejectedIds, setRejectedIds] = React.useState<Set<string>>(new Set())

  // Manual categorization state
  const [categorySlug, setCategorySlug] = React.useState<string | undefined>()
  const [scope, setScope] = React.useState<ManualCategorizeScope>('same_merchant')
  const [saving, setSaving] = React.useState(false)
  const [lastChange, setLastChange] = React.useState<ManualCategorizeResponse | null>(null)
  const [isUndoing, setIsUndoing] = React.useState(false)

  // Compute how many unknowns would be affected by current scope
  const affectedCount = React.useMemo(() => {
    if (!txn || !unknowns || scope === 'just_this') return 0;

    const merchant = (txn as any).merchant_canonical || txn.merchant;
    const description = txn.description?.toLowerCase().trim();

    return unknowns.filter((u: UnknownTxn) => {
      if (u.id === txn.id) return false; // Exclude current txn
      if (u.category !== 'unknown') return false; // Only unknowns

      if (scope === 'same_merchant') {
        const uMerchant = (u as any).merchant_canonical || u.merchant;
        return uMerchant && merchant && uMerchant === merchant;
      }

      if (scope === 'same_description' && description) {
        const uDesc = u.description?.toLowerCase().trim();
        return uDesc && uDesc.includes(description);
      }

      return false;
    }).length;
  }, [txn, unknowns, scope]);

  React.useEffect(() => {
    if (!open || !txnId) return
    let ignore = false
    setLoading(true)
    setError(null)
    setLlmUnavailable(false)
    ;(async () => {
      try {
        const res = await getExplain(txnId)
        if (!ignore) setData(res)
      } catch (e: any) {
        if (!ignore) {
          // Treat 404 as "LLM explanation unavailable" - not an error
          const is404 = e?.status === 404 || e?.response?.status === 404 || String(e).includes('404')
          if (is404) {
            setLlmUnavailable(true)
          } else {
            setError(e?.message ?? String(e))
          }
        }
      } finally {
        if (!ignore) setLoading(false)
      }
    })()
    return () => { ignore = true }
  }, [open, txnId])

  const rationale = data?.llm_rationale || data?.rationale || ''
  const mode = data?.mode || (data?.llm_rationale ? 'llm' : 'deterministic')
  const top = React.useMemo(() => selectTopMerchantCat(data), [data])

  const handleDontSuggest = React.useCallback(async (sug: SuggestionItem) => {
    const merchant = (txn?.merchant_canonical || txn?.merchant || '').toLowerCase()
    if (!merchant || !sug.category_slug) return

    const id = `${merchant}:${sug.category_slug}`
    try {
      setRejectingId(id)
      await rejectSuggestion(merchant, sug.category_slug)
      setRejectedIds(prev => new Set(prev).add(id))
      emitToastSuccess(t('ui.toast.rule_ignored', { merchant: txn?.merchant || merchant, category: sug.label || sug.category_slug }), {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await undoRejectSuggestion(merchant, sug.category_slug)
              setRejectedIds(prev => {
                const next = new Set(prev)
                next.delete(id)
                return next
              })
              emitToastSuccess(t('ui.toast.rule_accepted', { merchant: txn?.merchant || merchant, category: sug.label || sug.category_slug }))
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err)
              emitToastError(t('ui.toast.rule_accept_failed'), { description: msg })
            }
          }
        }
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emitToastError(t('ui.toast.rule_dismiss_failed'), { description: msg })
    } finally {
      setRejectingId(null)
    }
  }, [txn])

  if (!open || !portalReady || !document.body) return null;
  const fallbackHtml = buildDeterministicExplain(txn, data?.evidence, rationale);
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9900]" aria-modal role="dialog" data-testid="explain-drawer">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={() => onOpenChange(false)} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[460px] bg-[rgb(var(--panel))] text-zinc-100 ring-1 ring-white/10 shadow-2xl border-l border-white/5 z-[1] overflow-y-auto">
        <header className="sticky top-0 bg-[rgb(var(--panel))]/95 backdrop-blur px-4 py-3 border-b border-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Why this category?</h2>
            <button data-testid="drawer-close" className="text-sm opacity-80 hover:opacity-100" onClick={() => onOpenChange(false)}>Close</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill tone="muted">grounded</Pill>
            <Pill>{mode === 'llm' ? 'LLM rephrase' : 'Deterministic'}</Pill>
            {fallbackHtml && <Pill tone="muted">fallback</Pill>}
          </div>
        </header>
        <main className="px-4 py-4 prose-invert prose-sm space-y-4">
          {loading && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-28 rounded-full" />
              </div>
              <Skeleton className="h-4 w-[85%]" />
              <Skeleton className="h-4 w-[70%]" />
              <div className="border-t border-white/10 pt-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-6 w-40 rounded-2xl" />
                    <Skeleton className="h-6 w-48 rounded-2xl" />
                    <Skeleton className="h-6 w-36 rounded-2xl" />
                  </div>
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
              Failed to load explanation: <code>{error}</code>
            </div>
          )}

          {/* Display deterministic suggestions from local data */}
          {suggestions && suggestions.length > 0 && (
            <section className="space-y-3">
              <div className="text-xs uppercase tracking-wide opacity-70 mb-2">Suggestions for this transaction</div>
              {suggestions.map((sug) => {
                const merchant = (txn?.merchant_canonical || txn?.merchant || '').toLowerCase()
                const id = `${merchant}:${sug.category_slug}`
                const isRejected = rejectedIds.has(id)
                const isLoading = rejectingId === id

                return (
                  <div key={sug.category_slug} className="rounded-lg bg-slate-900/70 p-3 border border-white/5 space-y-2">
                    {/* Header: category + confidence + MODEL pill */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {sug.label || sug.category_slug}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">
                          {getSuggestionConfidencePercent(sug)}%
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-current bg-accent/10 text-slate-400 uppercase tracking-wide">
                          Model
                        </span>
                      </div>
                    </div>

                    {/* Human-readable explanation */}
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {formatSuggestionReason(sug.why)}
                    </p>

                    {/* Footer: confidence + feedback action */}
                    <div className="flex items-center justify-between pt-1 text-[11px] border-t border-white/5">
                      <span className="text-slate-500">
                        Suggestion confidence: {getSuggestionConfidencePercent(sug)}%
                      </span>

                      {!isRejected ? (
                        <button
                          type="button"
                          className="ml-3 text-slate-400 hover:text-rose-300 underline-offset-2 hover:underline disabled:opacity-60 transition-colors"
                          onClick={() => handleDontSuggest(sug)}
                          disabled={isLoading}
                        >
                          {isLoading ? 'Saving…' : "Don't suggest this"}
                        </button>
                      ) : (
                        <span className="ml-3 text-emerald-400">
                          ✓ We'll stop suggesting this
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          {data && !fallbackHtml && (
            <div className="text-sm leading-6 whitespace-pre-wrap">{rationale}</div>
          )}
          {fallbackHtml && (
            <div className="text-sm leading-6" dangerouslySetInnerHTML={{ __html: fallbackHtml }} />
          )}
          {data && (
            <div className="mt-2">
              <div className="text-xs uppercase tracking-wide mb-1 opacity-70">Evidence</div>
              <div className="flex flex-wrap gap-1.5">
                {data.evidence?.rule_match?.category && (
                  <Chip tone="good" title={`Rule #${data.evidence.rule_match.id}`}>Rule → {data.evidence.rule_match.category}</Chip>
                )}
                {top && (
                  <Chip tone="muted" title="Top historical category">History → {top.cat || 'Unknown'} • {top.count}</Chip>
                )}
                {(() => {
                  const fb = data.evidence?.feedback?.merchant_feedback?.[0]
                  if (!fb) return null
                  const pos = fb.positives || 0
                  const neg = fb.negatives || 0
                  return <Chip tone={pos >= neg ? 'good' : 'warn'} title="Feedback aggregate">Feedback {fb.category} • +{pos}/-{neg}</Chip>
                })()}
                {data.evidence?.merchant_norm && (
                  <Chip tone="muted" title="Canonical merchant">Merchant • {data.evidence.merchant_norm}</Chip>
                )}
              </div>
            </div>
          )}

          {/* Manual Categorization Section (for unknown transactions) */}
          {txn && txn.category === 'unknown' && (
            <div className="mt-6 rounded-2xl border border-border/40 bg-muted/40 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Categorize this transaction</h3>
                <span className="text-xs text-muted-foreground">Manual override</span>
              </div>

              <div className="space-y-2">
                <label htmlFor="category-select" className="text-xs font-medium">Category</label>
                <select
                  id="category-select"
                  className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={categorySlug || ''}
                  onChange={(e) => setCategorySlug(e.target.value || undefined)}
                >
                  <option value="">Choose a category</option>
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.slug} value={cat.slug}>
                      {cat.parent ? `  ${cat.label}` : cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium">Apply to</label>
                <div className="grid gap-2 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="scope"
                      value="just_this"
                      checked={scope === 'just_this'}
                      onChange={(e) => setScope(e.target.value as ManualCategorizeScope)}
                      className="w-4 h-4"
                    />
                    <span>Just this transaction</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="scope"
                      value="same_merchant"
                      checked={scope === 'same_merchant'}
                      onChange={(e) => setScope(e.target.value as ManualCategorizeScope)}
                      className="w-4 h-4"
                    />
                    <span>All unknowns from this merchant</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      name="scope"
                      value="same_description"
                      checked={scope === 'same_description'}
                      onChange={(e) => setScope(e.target.value as ManualCategorizeScope)}
                      className="w-4 h-4"
                    />
                    <span>All unknowns with similar description</span>
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    disabled={!categorySlug || saving}
                    onClick={async () => {
                      if (!categorySlug || !txnId) return;
                      setSaving(true);
                      try {
                        const res = await manualCategorizeTransaction(txnId, { categorySlug, scope });
                        setLastChange(res); // Store for undo

                        // Save to localStorage for Settings drawer access
                        try {
                          window.localStorage.setItem('lm:lastManualCategorize', JSON.stringify(res));
                        } catch {
                          // ignore storage errors
                        }

                        const categoryLabel = CATEGORY_DEFS[categorySlug]?.label || categorySlug;

                        emitToastSuccess(
                          res.similar_updated > 0
                            ? `Categorized 1 transaction (+${res.similar_updated} similar) as ${categoryLabel}.`
                            : `Categorized 1 transaction as ${categoryLabel}.`
                        );
                        onRefresh?.(); // Trigger parent to refetch
                        onOpenChange(false); // Close drawer
                      } catch (err: any) {
                        emitToastError(err?.message ?? 'Categorization failed. Please try again.');
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    {saving ? 'Saving…' : 'Apply'}
                  </Button>
                </div>

                {/* Scope summary */}
                <p className="text-xs text-muted-foreground text-right">
                  {scope === 'just_this' && 'Will update 1 transaction'}
                  {scope === 'same_merchant' && (
                    affectedCount > 0
                      ? `Will update 1 transaction (+${affectedCount} unknowns from this merchant)`
                      : 'Will update 1 transaction (+ all unknowns from this merchant)'
                  )}
                  {scope === 'same_description' && (
                    affectedCount > 0
                      ? `Will update 1 transaction (+${affectedCount} unknowns with similar description)`
                      : 'Will update 1 transaction (+ all unknowns with similar description)'
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Undo last bulk change */}
          {lastChange && lastChange.affected && lastChange.affected.length > 0 && (
            <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-200">Last bulk change</h3>
                <Button
                  size="sm"
                  variant="default"
                  disabled={isUndoing}
                  onClick={async () => {
                    setIsUndoing(true);
                    try {
                      const res = await manualCategorizeUndo(lastChange.affected);
                      emitToastSuccess(`Reverted ${res.reverted_count} transaction${res.reverted_count !== 1 ? 's' : ''}.`);
                      setLastChange(null);
                      onRefresh?.();
                    } catch (err: any) {
                      emitToastError(err?.message ?? 'Undo failed. Please try again.');
                    } finally {
                      setIsUndoing(false);
                    }
                  }}
                >
                  {isUndoing ? 'Undoing…' : 'Undo this change'}
                </Button>
              </div>

              <p className="text-xs text-slate-400 mb-3">
                {lastChange.similar_updated + 1} transaction{lastChange.similar_updated > 0 ? 's' : ''} categorized
              </p>

              <div className="max-h-40 overflow-y-auto space-y-2 rounded-lg bg-slate-950/50 p-2">
                {lastChange.affected.map((txn) => (
                  <div
                    key={txn.id}
                    className="flex items-center justify-between text-xs px-2 py-1 rounded bg-slate-900/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-300 truncate">{txn.merchant}</div>
                      <div className="text-slate-500">{new Date(txn.date).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right ml-2">
                      <div className="text-slate-300 font-mono">${Math.abs(Number(txn.amount)).toFixed(2)}</div>
                      <div className="text-slate-500 text-[10px]">
                        {CATEGORY_DEFS[txn.previous_category_slug]?.label || txn.previous_category_slug} → {CATEGORY_DEFS[txn.new_category_slug]?.label || txn.new_category_slug}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </aside>
    </div>,
    getPortalRoot()
  )
}
