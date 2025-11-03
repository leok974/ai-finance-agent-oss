import * as React from 'react'
import { ThresholdsSchema } from '@/lib/schemas'
import { saveRule } from '@/lib/api'
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers'
import { t } from '@/lib/i18n';
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  month?: string
  scenario?: string
  defaultCategory?: string
}

export default function SaveRuleModal({ open, onOpenChange, month, scenario, defaultCategory }: Props) {
  const [name, setName] = React.useState('Auto: New rule')
  const [category, setCategory] = React.useState('')
  const [minConfidence, setMinConfidence] = React.useState<number>(0.66)
  const [budgetPercent, setBudgetPercent] = React.useState<number | ''>('')
  const [limit, setLimit] = React.useState<number | ''>('')
  const [busy, setBusy] = React.useState(false)
  const [errors, setErrors] = React.useState<{minConf?: string; budgetPct?: string; limit?: string}>({})

  React.useEffect(() => {
    if (!open) return;
    setName(scenario ? `Auto: ${scenario}`.slice(0, 64) : 'Auto: New rule');
    setCategory(defaultCategory || '');
    setMinConfidence(0.66);
    setBudgetPercent('');
    setLimit('');
  }, [open, scenario, defaultCategory]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      setBusy(true)
      const nextErr: any = {}
      if (minConfidence < 0 || minConfidence > 1) nextErr.minConf = 'Min confidence must be between 0 and 1'
      if (budgetPercent !== '' && (Number(budgetPercent) < 0 || Number(budgetPercent) > 100)) nextErr.budgetPct = 'Budget % must be 0–100'
      if (limit !== '' && Number(limit) < 0) nextErr.limit = 'Limit must be ≥ 0'
      setErrors(nextErr)
      if (Object.keys(nextErr).length) throw new Error('Please fix validation errors')
      const thresholds = ThresholdsSchema.parse({
        minConfidence,
        budgetPercent: budgetPercent === '' ? undefined : Number(budgetPercent),
        limit: limit === '' ? undefined : Number(limit)
      })
      const res = await saveRule({
        rule: {
          name,
          when: { ...(scenario ? { scenario } : {}), thresholds, ...(category ? { category } : {}) },
          then: { ...(category ? { category } : {}) }
        },
        month
      }, { idempotencyKey: crypto.randomUUID() })
      emitToastSuccess(t('ui.toast.save_rule_modal_saved_title', { name: res?.display_name ?? name }))
      onOpenChange(false)
    } catch (err: any) {
  emitToastError(err?.message ?? t('ui.toast.save_rule_modal_save_failed_title'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-neutral-900 border border-neutral-800 rounded-md p-5 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-semibold mb-4">Save as Rule</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sr-name">Rule Name</Label>
            <input id="sr-name" className="w-full bg-neutral-800 rounded px-2 py-1" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} maxLength={64} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sr-category">Category (optional)</Label>
            <input id="sr-category" className="w-full bg-neutral-800 rounded px-2 py-1" placeholder="Groceries" value={category} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCategory(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sr-minconf">Min Confidence</Label>
              <input id="sr-minconf" className="w-full bg-neutral-800 rounded px-2 py-1" type="number" step="0.01" min={0} max={1} value={minConfidence} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinConfidence(Number(e.target.value))} aria-invalid={!!errors.minConf} aria-describedby="sr-minconf-err" />
              {errors.minConf && <p id="sr-minconf-err" className="text-xs text-red-400">{errors.minConf}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sr-budgetpct">Budget %</Label>
              <input id="sr-budgetpct" className="w-full bg-neutral-800 rounded px-2 py-1" type="number" step="1" min={0} max={100} placeholder="e.g., 25" value={budgetPercent} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBudgetPercent(e.target.value === '' ? '' : Number(e.target.value))} aria-invalid={!!errors.budgetPct} aria-describedby="sr-budgetpct-err" />
              {errors.budgetPct && <p id="sr-budgetpct-err" className="text-xs text-red-400">{errors.budgetPct}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sr-limit">Limit</Label>
              <input id="sr-limit" className="w-full bg-neutral-800 rounded px-2 py-1" type="number" step="0.01" min={0} placeholder="e.g., 200" value={limit} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLimit(e.target.value === '' ? '' : Number(e.target.value))} aria-invalid={!!errors.limit} aria-describedby="sr-limit-err" />
              {errors.limit && <p id="sr-limit-err" className="text-xs text-red-400">{errors.limit}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="pill-outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save Rule'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
