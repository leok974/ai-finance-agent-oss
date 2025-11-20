import React, { useState, useEffect, useCallback } from 'react';
import Card from './Card';
import { emitToastError } from '@/lib/toast-helpers';
import { t } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchJSON } from '@/lib/http';

type MerchantHint = {
  id: number;
  merchant_canonical: string;
  category_slug: string;
  confidence: number;
  support: number;
  created_at: string;
  updated_at: string;
};

type HintsResponse = {
  items: MerchantHint[];
  total: number;
  limit: number;
  offset: number;
};

export default function MerchantHintsPanel() {
  const [hints, setHints] = useState<MerchantHint[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const limit = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchJSON<HintsResponse>('admin/ml-feedback/hints', {
        query: { limit, offset: page * limit },
      });
      setHints(res.items || []);
      setTotal(res.total || 0);
    } catch (e: any) {
      emitToastError('Failed to load hints', {
        description: e?.message || 'Could not fetch merchant category hints',
      });
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(total / limit);

  return (
    <Card>
      <header className="flex items-center gap-3 pb-3 mb-4 border-b border-border">
        <div className="flex-1">
          <h3 className="text-lg font-semibold">ML-Promoted Category Hints</h3>
          <p className="text-sm opacity-70 mt-1">
            Merchant → Category mappings learned from user feedback
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {loading && hints.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 border border-border rounded-lg"
            >
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32 ml-auto" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : hints.length === 0 ? (
        <div className="text-center py-8 text-sm opacity-70">
          No promoted hints yet. Hints are created when users provide feedback on
          category suggestions.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {hints.map((hint) => (
              <div
                key={hint.id}
                className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{hint.merchant_canonical}</div>
                  <div className="text-sm opacity-70">
                    → {hint.category_slug}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right">
                    <div className="opacity-70">Confidence</div>
                    <div className="font-mono font-semibold">
                      {(hint.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="opacity-70">Support</div>
                    <div className="font-mono">{hint.support}</div>
                  </div>
                  <div className="text-right opacity-60 text-xs">
                    {new Date(hint.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <div className="text-sm opacity-70">
                Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of{' '}
                {total}
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || loading}
                >
                  Previous
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1 || loading}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
