import { useEffect, useState } from "react";
import { getRules, type RuleListItem } from "@/api";

export function useRulesQuery(params: { q?: string; active?: boolean; limit?: number; offset?: number }) {
  const [items, setItems] = useState<RuleListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await getRules(params);
        if (!cancelled) {
          setItems(res.items);
          setTotal(res.total);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load rules");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params.q, params.active, params.limit, params.offset]);

  return { items, total, loading, err };
}
