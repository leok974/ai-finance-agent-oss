import { useEffect, useState } from 'react';
import { agentTools } from '@/lib/api';
export type Suggestion = { merchant: string; suggest_category: string; confidence: number; support: number };

export function useSuggestions(latestMonth?: string) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [meta, setMeta] = useState<Record<string, string> | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const enabled = import.meta.env.VITE_SUGGESTIONS_ENABLED === '1';

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    agentTools.suggestionsWithMeta({ month: latestMonth, window_months: 3, min_support: 3, min_share: 0.6, limit: 10 } as Record<string, unknown>)
      .then((res: unknown) => {
        if (cancelled) return;
        const r = (res as { items?: unknown; meta?: Record<string, string> | undefined }) || {};
        const items = Array.isArray(r.items) ? (r.items as unknown[]).filter(v => v && typeof v === 'object') as Suggestion[] : [];
        setItems(items);
        setMeta(r.meta);
      })
      .catch(() => { if (!cancelled) { setItems([]); setMeta(undefined); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, latestMonth]);

  return { enabled, items, meta, loading };
}
