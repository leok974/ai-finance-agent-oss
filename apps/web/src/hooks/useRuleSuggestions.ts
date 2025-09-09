import { useCallback, useEffect, useState } from "react";
import { acceptRuleSuggestion, dismissRuleSuggestion, listRuleSuggestions, RuleSuggestion } from "@/lib/api";

type Query = {
  merchant_norm?: string;
  category?: string;
  limit?: number;
  offset?: number;
};

export function useRuleSuggestions(initial: Query = {}) {
  const [items, setItems] = useState<RuleSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<Query>({ limit: 50, offset: 0, ...initial });
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);
  const setFilter = useCallback((q: Query) => setQuery((prev) => ({ ...prev, ...q, offset: 0 })), []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await listRuleSuggestions(query);
        if (!cancelled) setItems(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Failed to load suggestions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [query.merchant_norm, query.category, query.limit, query.offset, refreshNonce]);

  const accept = useCallback(async (id: number) => {
    await acceptRuleSuggestion(id);
    refresh();
  }, [refresh]);

  const dismiss = useCallback(async (id: number) => {
    await dismissRuleSuggestion(id);
    refresh();
  }, [refresh]);

  return { items, loading, error, query, setFilter, setQuery, refresh, accept, dismiss };
}
