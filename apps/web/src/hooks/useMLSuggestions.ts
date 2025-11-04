/**
 * useMLSuggestions - Hook for fetching and managing ML category suggestions
 */
import { useState, useEffect, useCallback } from 'react';
import { getMLSuggestions, sendSuggestionFeedback, type SuggestItem } from '@/lib/api';

type UseMLSuggestionsOptions = {
  enabled?: boolean;
  topK?: number;
  mode?: 'heuristic' | 'model' | 'auto';
};

type SuggestionsState = {
  items: Map<string, SuggestItem>;
  loading: boolean;
  error: string | null;
};

export function useMLSuggestions(
  transactionIds: string[],
  options: UseMLSuggestionsOptions = {}
) {
  const { enabled = true, topK = 3, mode = 'auto' } = options;

  const [state, setState] = useState<SuggestionsState>({
    items: new Map(),
    loading: false,
    error: null,
  });

  const fetchSuggestions = useCallback(async () => {
    if (!enabled || transactionIds.length === 0) {
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await getMLSuggestions({
        txn_ids: transactionIds,
        top_k: topK,
        mode,
      });

      const itemsMap = new Map<string, SuggestItem>();
      response.items.forEach((item) => {
        itemsMap.set(item.txn_id, item);
      });

      setState({
        items: itemsMap,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch suggestions',
      }));
    }
  }, [transactionIds.join(','), enabled, topK, mode]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const acceptSuggestion = useCallback(
    async (txnId: string, label: string) => {
      const item = state.items.get(txnId);
      if (!item?.event_id) {
        return;
      }

      try {
        await sendSuggestionFeedback(item.event_id, 'accept', `Applied category: ${label}`);
      } catch (err) {
        console.error('Failed to send feedback:', err);
      }
    },
    [state.items]
  );

  const rejectSuggestion = useCallback(
    async (txnId: string, label: string, reason?: string) => {
      const item = state.items.get(txnId);
      if (!item?.event_id) {
        return;
      }

      try {
        await sendSuggestionFeedback(
          item.event_id,
          'reject',
          reason || `Rejected suggestion: ${label}`
        );
      } catch (err) {
        console.error('Failed to send feedback:', err);
      }
    },
    [state.items]
  );

  const getSuggestionsForTransaction = useCallback(
    (txnId: string) => {
      return state.items.get(txnId);
    },
    [state.items]
  );

  return {
    suggestions: state.items,
    loading: state.loading,
    error: state.error,
    getSuggestionsForTransaction,
    acceptSuggestion,
    rejectSuggestion,
    refetch: fetchSuggestions,
  };
}

/**
 * Hook for managing suggestions for uncategorized transactions only
 */
export function useUncategorizedMLSuggestions(
  transactions: Array<{ id: string | number; category?: string | null }>,
  options: UseMLSuggestionsOptions = {}
) {
  const uncategorizedIds = transactions
    .filter((t) => !t.category || t.category === 'Unknown' || t.category === '')
    .map((t) => String(t.id));

  return useMLSuggestions(uncategorizedIds, options);
}
