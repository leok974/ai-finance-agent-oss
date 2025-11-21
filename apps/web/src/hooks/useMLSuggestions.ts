/**
 * useMLSuggestions - Hook for fetching and managing ML category suggestions
 * Refactored to use canonical API (suggestForTxnBatch, mlFeedback)
 */
import { useState, useEffect, useCallback } from 'react';
import { suggestForTxnBatch, mlFeedback, type CategorizeSuggestion } from '@/lib/api';

type UseMLSuggestionsOptions = {
  enabled?: boolean;
  topK?: number;
};

type SuggestionItem = {
  txn: number;
  suggestions: CategorizeSuggestion[];
};

type SuggestionsState = {
  items: Map<number, CategorizeSuggestion[]>;
  loading: boolean;
  error: string | null;
};

export function useMLSuggestions(
  transactionIds: number[],
  options: UseMLSuggestionsOptions = {}
) {
  const { enabled = true } = options;

  const [state, setState] = useState<SuggestionsState>({
    items: new Map(),
    loading: false,
    error: null,
  });

  const fetchSuggestions = useCallback(async () => {
    if (!enabled || transactionIds.length === 0) {
      setState({ items: new Map(), loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await suggestForTxnBatch(transactionIds);

      const itemsMap = new Map<number, CategorizeSuggestion[]>();
      (response?.items || []).forEach((item: SuggestionItem) => {
        itemsMap.set(item.txn, item.suggestions || []);
      });

      setState({
        items: itemsMap,
        loading: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch suggestions';
      const is404 = message.includes('404') || message.includes('Not Found');

      // Don't treat 404 as error - feature may not be deployed
      if (is404) {
        setState({ items: new Map(), loading: false, error: null });
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: message,
        }));
      }
    }
  }, [transactionIds.join(','), enabled]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const acceptSuggestion = useCallback(
    async (txnId: number, category: string, merchant?: string) => {
      // Fire-and-forget ML feedback
      mlFeedback({
        txn_id: txnId,
        merchant,
        category,
        action: 'accept',
      }).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        const is404 = message.includes('404') || message.includes('Not Found');
        if (!is404) {
          console.warn('[useMLSuggestions] mlFeedback failed (non-critical):', message);
        }
      });
    },
    []
  );

  const rejectSuggestion = useCallback(
    async (txnId: number, category: string, merchant?: string) => {
      // Fire-and-forget ML feedback
      mlFeedback({
        txn_id: txnId,
        merchant,
        category,
        action: 'reject',
      }).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        const is404 = message.includes('404') || message.includes('Not Found');
        if (!is404) {
          console.warn('[useMLSuggestions] mlFeedback failed (non-critical):', message);
        }
      });
    },
    []
  );

  const getSuggestionsForTransaction = useCallback(
    (txnId: number) => {
      return state.items.get(txnId) || [];
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
    .filter((t) => !t.category || t.category === 'uncategorized' || t.category === 'unknown')
    .map((t) => Number(t.id));

  return useMLSuggestions(uncategorizedIds, options);
}
