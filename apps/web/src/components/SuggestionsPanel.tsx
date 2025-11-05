import React, { useEffect, useState } from 'react';
import { useSuggestions, type Suggestion } from '@/hooks/useSuggestions';
import { FEATURES } from '@/config/featureFlags';
import { createCategorizeRule } from '@/api/rules';
import { track } from '@/lib/analytics';
import SectionCard from '@/components/ui/SectionCard';

type OverrideProps = {
  items?: Suggestion[] | null;
  meta?: Record<string, string> | undefined;
  loading?: boolean;
};

export function SuggestionsPanel({ month, items: itemsOverride, meta: metaOverride, loading: loadingOverride }: { month?: string } & OverrideProps) {
  const hook = useSuggestions(month);
  const items = itemsOverride ?? hook.items;
  const meta = metaOverride ?? hook.meta;
  const loading = loadingOverride ?? hook.loading;
  const hasOverrides = itemsOverride !== undefined || metaOverride !== undefined || loadingOverride !== undefined;
  const active = (hook.enabled && FEATURES.suggestions) || hasOverrides;

  // Hooks must be unconditional (no early return before declaring them)
  const [rows, setRows] = useState(items ?? []);
  useEffect(() => { setRows(items ?? []); }, [items]);
  // Impression tracking when rows change
  useEffect(() => {
    if (!rows) return;
    track('suggestions_impression', { month: month ?? null, count: rows.length });
  }, [rows, month]);
  const [saving, setSaving] = useState<Record<string, 'idle'|'saving'|'ok'|'err'|'exists'>>({});
  const [toast, setToast] = useState<{ msg: string; kind: 'ok'|'warn'|'err'} | null>(null);
  useEffect(() => {
    if (!toast) return; const t = setTimeout(()=> setToast(null), 2000); return ()=> clearTimeout(t);
  }, [toast]);

  // Telemetry: record meta reasons when present (empty states)
  useEffect(() => {
    // Only fire when suggestions are active and not loading
    if (!active || loading) return;
    const reason: string | undefined = meta?.reason;
    if (reason) {
      track('suggestions_empty_reason', { month: month ?? null, reason });
    }
  }, [active, loading, meta, month]);

  const keyOf = (m: string, c: string, i: number) => `${m}||${c}||${i}`;
  const saveRule = async (merchant: string, category: string, k: string) => {
    setSaving(s => ({ ...s, [k]: 'saving' }));
    const startedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    track('suggestion_create_attempt', { month: month ?? null, merchant, category });
    const r = await createCategorizeRule({ merchant, category });
    setSaving(s => {
      if (!r.ok) return { ...s, [k]: 'err' };
      if (r.message === 'exists') return { ...s, [k]: 'exists' };
      return { ...s, [k]: 'ok' };
    });
    if (r.ok) setRows(prev => prev.filter((row, idx) => keyOf(row.merchant, row.suggest_category, idx) !== k));
    if (!r.ok) setToast({ msg: 'Error creating rule', kind: 'err' });
    else if (r.message === 'exists') setToast({ msg: 'Rule already exists', kind: 'warn' });
    else setToast({ msg: 'Rule created', kind: 'ok' });
    const dur = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt);
    if (!r.ok) track('suggestion_create_error', { month: month ?? null, merchant, category, duration_ms: dur });
    else if (r.message === 'exists') track('suggestion_create_exists', { month: month ?? null, merchant, category, duration_ms: dur });
    else track('suggestion_create_success', { month: month ?? null, merchant, category, duration_ms: dur });
  };

  if (!active) return null;

  return (
    <SectionCard
      title="Suggestions"
      subtitle={month ?? 'latest'}
      className="relative"
      data-testid="suggestions-panel"
    >
      {toast && (
        <div
          data-testid="toast"
          role="status"
          aria-live="polite"
          className={
            'pointer-events-none absolute right-3 top-3 rounded-xl px-3 py-2 text-sm shadow z-10 ' +
            (toast.kind === 'ok'
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-700/50'
              : toast.kind === 'warn'
              ? 'bg-amber-500/10 text-amber-300 border border-amber-700/50'
              : 'bg-rose-500/10 text-rose-300 border border-rose-700/50')
          }
        >
          {toast.msg}
        </div>
      )}
      {loading && <div className="text-muted-foreground">Loading suggestions…</div>}
      {!loading && (!rows || rows.length === 0) && (
        <div className="text-muted-foreground">
          {meta?.reason === 'month_missing' && (
            <span>Select a month to see suggestions for uncategorized transactions.</span>
          )}
          {meta?.reason === 'no_data_for_month' && (
            <span>No uncategorized transactions found for this month. Try another month or lower the thresholds.</span>
          )}
          {!meta?.reason && (
            <span>All caught up — no suggestions right now 🎉</span>
          )}
        </div>
      )}
      {!loading && rows && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left">Merchant</th>
              <th className="text-left">Suggested Category</th>
              <th className="text-right">Confidence</th>
              <th className="text-right">Support</th>
              <th className="text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const k = keyOf(s.merchant, s.suggest_category, i);
              const state = saving[k] ?? 'idle';
              return (
                <tr key={`${s.merchant}-${s.suggest_category}-${i}`} data-testid="suggestion-row">
                  <td>{s.merchant}</td>
                  <td>{s.suggest_category}</td>
                  <td className="text-right" aria-label={`confidence ${(s.confidence * 100).toFixed(0)} percent`}>{(s.confidence * 100).toFixed(0)}%</td>
                  <td className="text-right">{s.support}</td>
                  <td className="text-right">
                    {state === 'ok' && <span className="text-emerald-400">Created</span>}
                    {state === 'exists' && <span className="text-amber-400">Exists</span>}
                    {state === 'err' && <span className="text-rose-400">Error</span>}
                    {state === 'saving' && <span className="text-neutral-400">Saving…</span>}
                    {(state === 'idle' || state === 'err') && (
                      <button
                        data-testid="suggestions-create"
                        onClick={() => saveRule(s.merchant, s.suggest_category, k)}
                        className="px-3 py-1 rounded-2xl border bg-background hover:shadow"
                        aria-label={`Create categorize rule for ${s.merchant} → ${s.suggest_category}`}
                      >
                        Create
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}

export default SuggestionsPanel;
