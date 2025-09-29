import React from 'react';
import Card from './Card';
import { listSuggestionIgnores, removeSuggestionIgnore } from '@/lib/api';
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers';
import { t } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';

export default function SuggestionIgnoresPanel() {
  const [rows, setRows] = React.useState<Array<{ merchant: string; category: string }>>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await listSuggestionIgnores(true);
      setRows(Array.isArray(res?.ignores) ? res.ignores : []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load ignores');
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <header className="flex items-center gap-3 pb-1 mb-3 border-b border-border">
        <h3 className="text-base font-semibold">Ignored Pairs</h3>
        <div className="ml-auto">
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <div className="text-sm text-red-500">{error}</div>}
      {loading && (
        <div className="space-y-2">
          {[0,1,2].map(i => (
            <div key={i} className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
      )}
      {!error && rows.length === 0 && (
        <div className="px-3 py-4 text-sm opacity-70">No ignored (merchant, category) pairs.</div>
      )}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={`${r.merchant}-${r.category}-${i}`} className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
            <div className="font-medium truncate mr-3">{r.merchant} → {r.category}</div>
            <button
              className="rounded-md border border-border px-2 py-1 text-xs"
              onClick={async () => {
                try {
                  const next = await removeSuggestionIgnore(r.merchant, r.category);
                  setRows(Array.isArray(next?.ignores) ? next.ignores : []);
                  emitToastSuccess(t('ui.toast.suggestion_ignore_removed_title', { merchant: r.merchant, category: r.category }));
                } catch (e: any) {
                  emitToastError(e?.message ?? t('ui.toast.suggestion_ignore_remove_failed_title'));
                }
              }}
            >Remove</button>
          </div>
        ))}
      </div>
    </Card>
  );
}
