import { useEffect, useState } from "react";
import { fetchJSON } from "@/lib/http";

type Explain = {
  title: string;
  what: string;
  why: string;
  insights?: { merchant: string; spend: number; count: number }[];
  actions?: string[];
};

export function CardHelp({
  panelId,
  month,
}: {
  panelId: string;
  month: string;
}) {
  const [data, setData] = useState<Explain | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetchJSON<Explain>(`agent/describe/${encodeURIComponent(panelId)}`, {
      query: { month },
    })
      .then((result) => {
        if (isMounted) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(() => {
        // Fallback heuristics if backend fails
        if (!isMounted) return;
        setData({
          title: `Context — ${month}`,
          what: "Showing your highest-spend merchants and any outsized daily outflows this month.",
          why: "Concentration or recurring bills can dominate spend; we highlight the likely drivers.",
          actions: [
            "Use 'Unknowns' to accept/reject and create rules.",
            "Set budgets for top merchants.",
            "Try ML canary once shadow agreement is healthy.",
          ],
        });
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [panelId, month]);

  if (loading) {
    return (
      <div className="p-3 text-sm text-muted-foreground">Loading...</div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="font-semibold text-base">{data.title}</div>

      <div>
        <span className="font-semibold text-foreground">What</span>
        <span className="text-muted-foreground"> — </span>
        <span>{data.what}</span>
      </div>

      <div>
        <span className="font-semibold text-foreground">Why</span>
        <span className="text-muted-foreground"> — </span>
        <span>{data.why}</span>
      </div>

      {data.actions && data.actions.length > 0 && (
        <div>
          <div className="font-semibold text-foreground mb-1">
            Next Steps
          </div>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            {data.actions.map((action, i) => (
              <li key={i}>{action}</li>
            ))}
          </ul>
        </div>
      )}

      {data.insights && data.insights.length > 0 && (
        <div className="mt-4 pt-3 border-t">
          <div className="font-semibold text-foreground mb-2">
            Top Merchants Detail
          </div>
          <div className="space-y-1 text-xs">
            {data.insights.map((insight, i) => (
              <div
                key={i}
                className="flex justify-between text-muted-foreground"
              >
                <span>{insight.merchant}</span>
                <span>
                  ${insight.spend.toFixed(0)} ({insight.count} txns)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
