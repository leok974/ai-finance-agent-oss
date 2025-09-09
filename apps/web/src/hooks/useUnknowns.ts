import { useEffect, useState } from "react";
import { getUnknowns } from "@/api";

export type UnknownTxn = {
  id: number;
  date: string;
  merchant?: string | null;
  description?: string | null;
  amount: number;
  category?: string | null;
};

export function useUnknowns(month?: string, limit = 25) {
  const [items, setItems] = useState<UnknownTxn[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!month) {
      // Guard: don’t fetch until we know the month
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Backend route: /txns/unknowns with optional month; limit not used server-side currently
        const data = await getUnknowns(month);
        if (ac.signal.aborted) return;
        const rows = Array.isArray(data) ? data : (data as any)?.unknowns ?? [];
        setItems(rows as UnknownTxn[]);
        const m = (data as any)?.month;
        setCurrentMonth(typeof m === "string" ? m : month ?? null);
      } catch (e: any) {
        if (!ac.signal.aborted) setError(e?.message ?? "Failed to load unknowns");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [month, limit, nonce]);

  return { items, loading, error, currentMonth, refresh: () => setNonce((n) => n + 1) };
}
