import React from 'react';
import Card from './Card';
import { listSuggestionIgnores, removeSuggestionIgnore } from '@/lib/api';
import { showToast } from '@/lib/toast-helpers';

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
                  showToast?.(`Removed ignore for ${r.merchant} → ${r.category}`, { type: 'success' });
                } catch (e: any) {
                  showToast?.(e?.message ?? 'Failed to remove', { type: 'error' });
                }
              }}
            >Remove</button>
          </div>
        ))}
      </div>
    </Card>
  );
}
