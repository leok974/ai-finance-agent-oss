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
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers'
import { t } from '@/lib/i18n'

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

export default function ExplainSignalDrawer({ txnId, open, onOpenChange, txn, suggestions }: {
  txnId: number | null
  open: boolean
  onOpenChange: (v: boolean) => void
  txn?: any
  suggestions?: SuggestionItem[]
}) {
  const portalReady = useSafePortalReady();
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [llmUnavailable, setLlmUnavailable] = React.useState(false)
  const [data, setData] = React.useState<ExplainResponse | null>(null)
  const [rejectingId, setRejectingId] = React.useState<string | null>(null)
  const [rejectedIds, setRejectedIds] = React.useState<Set<string>>(new Set())

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
                          {Math.round(sug.score * 100)}%
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
                        Suggestion confidence: {Math.round(sug.score * 100)}%
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
        </main>
      </aside>
    </div>,
    getPortalRoot()
  )
}
