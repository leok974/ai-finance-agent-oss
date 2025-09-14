import React, { useEffect, useState } from "react";
import Card from "./Card";
import BudgetRecommendationsPanel from "./BudgetRecommendationsPanel";
import { getBudgetCheck } from "../lib/api";
import EmptyState from "./EmptyState";
import HelpBadge from "./HelpBadge";

interface Props {
  /** Optional. If omitted, backend uses latest month. */
  month?: string;
  refreshKey?: number;
}

const BudgetsPanel: React.FC<Props> = ({ month, refreshKey = 0 }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      setEmpty(false);
      try {
        const res = await getBudgetCheck(month); // 👈 month optional
        if (!alive) return;
        if (!res) { setEmpty(true); setData(null); }
        else { setData(res); }
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [month, refreshKey]);

  const resolvedMonth = data?.month ?? month ?? "(latest)";
  const items = data?.budget_items ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title={`Budgets — ${resolvedMonth}`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold flex items-center">
            Budgets — {resolvedMonth}
            <HelpBadge k="cards.budgets" className="ml-2" />
          </h3>
        </div>
        {loading && <p className="text-sm text-gray-400">Loading budgets…</p>}
        {error && !empty && <p className="text-sm text-rose-300">Error: {error}</p>}
        {empty && !error && (
          <EmptyState title="No budgets to show" note="Upload a CSV and/or add budget rules to see this panel." />
        )}
        {!loading && !error && !empty && items.length === 0 && (
          <p className="text-sm text-gray-400">No budget rules yet.</p>
        )}
        {!loading && !error && !empty && items.length > 0 && (
          <div className="space-y-2 text-sm">
            {items.map((b: any, i: number) => {
              const over = (b.over ?? 0) > 0;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                    over
                      ? "border-rose-700 bg-rose-900/20 text-rose-100"
                      : "border-emerald-700 bg-emerald-900/20 text-emerald-100"
                  }`}
                >
                  <div className="font-medium">{b.category}</div>
                  <div className="text-right">
                    <div>Spent: ${Math.abs(b.spent ?? 0).toFixed(0)}</div>
                    <div>Limit: ${Math.abs(b.limit ?? 0).toFixed(0)}</div>
                    {over && <div className="font-semibold">Over: ${Math.abs(b.over ?? 0).toFixed(0)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <div data-explain-key="cards.budget_check">
        <BudgetRecommendationsPanel />
      </div>
    </div>
  );
};

export default BudgetsPanel;
