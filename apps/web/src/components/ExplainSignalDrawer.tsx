import * as React from 'react'
import { getExplain, type ExplainResponse } from '@/api'
import Chip from '@/components/ui/chip'

function GroundedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-border bg-accent/10">
      <span className="w-2 h-2 rounded-full border border-current" /> grounded
    </span>
  )
}

export default function ExplainSignalDrawer({ txnId, open, onOpenChange }: {
  txnId: number | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [data, setData] = React.useState<ExplainResponse | null>(null)

  React.useEffect(() => {
    if (!open || !txnId) return
    let ignore = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await getExplain(txnId)
        if (!ignore) setData(res)
      } catch (e: any) {
        if (!ignore) setError(e?.message ?? String(e))
      } finally {
        if (!ignore) setLoading(false)
      }
    })()
    return () => { ignore = true }
  }, [open, txnId])

  const rationale = data?.llm_rationale || data?.rationale || ''
  const mode = data?.mode || (data?.llm_rationale ? 'llm' : 'deterministic')

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
          <div className="ml-auto h-full w-full max-w-xl bg-background border-l border-border p-4 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">Why this category?</div>
              <button className="text-sm opacity-70 hover:opacity-100" onClick={() => onOpenChange(false)}>Close</button>
            </div>

            {loading && <div className="text-sm opacity-70">Loading…</div>}
            {error && (
              <div className="text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                Failed to load: <code>{error}</code>
              </div>
            )}

            {data && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <GroundedBadge />
                  <Chip tone={mode === 'llm' ? 'good' : 'muted'} size="sm">{mode === 'llm' ? 'LLM rephrase' : 'Deterministic'}</Chip>
                </div>

                <div className="text-sm leading-6 whitespace-pre-wrap">{rationale}</div>

                <div className="mt-2">
                  <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Evidence</div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.evidence?.rule_match?.category && (
                      <Chip tone="good" title={`Rule #${data.evidence.rule_match.id}`}>Rule → {data.evidence.rule_match.category}</Chip>
                    )}
                    {(() => {
                      const top = data.evidence?.similar?.by_category?.[0]
                      if (!top) return null
                      const label = `${top.category || 'Unknown'} • ${top.count}`
                      return <Chip tone="muted" title="Top historical category">History → {label}</Chip>
                    })()}
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
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
