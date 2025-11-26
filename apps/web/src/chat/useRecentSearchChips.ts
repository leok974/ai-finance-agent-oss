import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'lm:recent_search_queries';

export function useRecentSearchChips(limit = 4) {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setRecent(parsed.slice(0, limit));
      }
    } catch {
      // ignore
    }
  }, [limit]);

  const recordQuery = useCallback(
    (q: string) => {
      setRecent((prev) => {
        const next = [q, ...prev.filter((x) => x !== q)].slice(0, limit);
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [limit],
  );

  return { recentQueries: recent, recordQuery };
}
