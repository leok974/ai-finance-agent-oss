import React from "react";
import { getBudgetRecommendations, type BudgetRecommendation, applyBudgets, downloadReportPdf } from "@/lib/api";
import Card from "./Card";
import { emitToastSuccess, emitToastError } from "@/lib/toast-helpers";
import HelpBadge from "./HelpBadge";

const LS_KEY = "budgets_lookback_months";

export default function BudgetRecommendationsPanel() {
  const [months, setMonths] = React.useState<number>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const m = raw ? parseInt(raw, 10) : 6;
      return Number.isFinite(m) ? m : 6;
    } catch { return 6; }
  });
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<BudgetRecommendation[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [include, setInclude] = React.useState<string>("");
  const [exclude, setExclude] = React.useState<string>("");
  const [onlyRisky, setOnlyRisky] = React.useState(false);
  const [applyBusy, setApplyBusy] = React.useState<"" | "median" | "p75" | "median_plus_10">("");
  const [busyRow, setBusyRow] = React.useState<string | null>(null);

  React.useEffect(() => {
    try { localStorage.setItem(LS_KEY, String(months)); } catch {}
  }, [months]);

  const load = React.useCallback(async (m: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getBudgetRecommendations(m, {
        include_current: true,
        include_only_over_p75: onlyRisky,
        include: include ? include.split(",").map(s => s.trim()).filter(Boolean) : undefined,
        exclude: exclude ? exclude.split(",").map(s => s.trim()).filter(Boolean) : undefined,
      });
      setData(res.recommendations ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  }, [include, exclude, onlyRisky]);

  React.useEffect(() => {
    load(months);
  }, [months, load]);

  async function applySingleCategory(category: string, strategy: "median" | "p75" | "median_plus_10" = "median") {
    setBusyRow(category);
    try {
      const resp = await applyBudgets({ strategy, months, categories_include: [category] });
      const amt = resp.applied?.[0]?.amount ?? 0;
      emitToastSuccess('Budget applied', { description: `${category} = $${amt.toFixed(2)}` });
    } catch (e: any) {
      emitToastError(`Failed to apply ${category}`, { description: e?.message });
    } finally {
      setBusyRow(null);
      load(months);
    }
  }

  return (
    <Card className="w-full" title="Smart Budget Recommendations">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold flex items-center">
          Smart Budget Recommendations
          <HelpBadge k="cards.budget_recommendations" className="ml-2" />
        </h3>
      </div>
      <div className="flex flex-col gap-3 pb-2 mb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm opacity-70">Lookback</label>
            <select
              className="rounded-md border border-border bg-card px-2 py-1 text-sm"
              value={months}
              onChange={(e) => setMonths(parseInt(e.target.value, 10))}
            >
              {[3, 6, 9, 12, 18, 24].map((m) => (
                <option key={m} value={m}>{m} months</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm opacity-70">Include</label>
            <input className="w-40 rounded-md border border-border bg-card px-2 py-1 text-sm" placeholder="cat1, cat2" value={include} onChange={(e)=>setInclude(e.target.value)} />
            <label className="text-sm opacity-70">Exclude</label>
            <input className="w-40 rounded-md border border-border bg-card px-2 py-1 text-sm" placeholder="catA, catB" value={exclude} onChange={(e)=>setExclude(e.target.value)} />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={onlyRisky} onChange={(e)=>setOnlyRisky(e.target.checked)} />
              only risky (over p75)
            </label>
            <button
              className="ml-2 text-xs px-2 py-1 rounded-md border border-border hover:bg-neutral-800"
              onClick={()=>load(months)}
            >Apply Filters</button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs opacity-70">One-click:</span>
    {(["median","p75","median_plus_10"] as const).map((strategy) => (
            <button
              key={strategy}
              disabled={applyBusy === strategy}
              onClick={async ()=>{
                try {
                  setApplyBusy(strategy);
                  const includeList = include ? include.split(",").map(s=>s.trim()).filter(Boolean) : undefined;
                  const excludeList = exclude ? exclude.split(",").map(s=>s.trim()).filter(Boolean) : undefined;
      const r = await applyBudgets({ strategy, months, categories_include: includeList, categories_exclude: excludeList });
      emitToastSuccess('Budgets applied', { description: `${r.applied_count} categories — Total $${r.applied_total.toFixed(2)}` });
                } catch (e: any) {
      emitToastError('Failed to apply budgets', { description: e?.message });
                } finally {
                  setApplyBusy("");
                }
              }}
              className="text-xs px-2 py-1 rounded-md bg-white text-black hover:opacity-90 disabled:opacity-50"
              title={strategy === 'median_plus_10' ? 'Median + 10%' : strategy.toUpperCase()}
            >
              {strategy === 'median' ? 'Apply Median' : strategy === 'p75' ? 'Apply p75' : 'Apply Median+10%'}
            </button>
          ))}
          <button
            className="ml-2 text-[11px] px-2 py-1 rounded-md border border-neutral-700 hover:bg-neutral-900"
            title="Export PDF report"
            onClick={async () => {
              try {
                const { blob, filename } = await downloadReportPdf();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename || 'finance_report.pdf';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch (err: any) {
                alert(`PDF export failed: ${err?.message || String(err)}`);
              }
            }}
          >
            Export PDF
          </button>
        </div>
      </div>

      {loading && <div className="text-sm opacity-70">Loading…</div>}
      {error && <div className="text-sm text-red-500">{error}</div>}

      {!loading && !error && (
        <div className="overflow-x-auto">
      <table className="w-full text-sm">
            <thead className="text-left opacity-70">
              <tr>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Median</th>
                <th className="py-2 pr-3">p75</th>
                <th className="py-2 pr-3">Avg</th>
                <th className="py-2 pr-3">Months</th>
                <th className="py-2 pr-3">Current</th>
                <th className="py-2 pr-0 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-3 opacity-70">
                    No recommendations yet. Ingest more data or widen the lookback.
                  </td>
                </tr>
              )}
              {data.map((r) => {
                const risky = !!r.over_p75;
                return (
                  <tr key={r.category} className={`border-t border-border/50 ${risky ? 'bg-rose-900/10' : ''}`}>
                    <td className="py-2 pr-3 flex items-center gap-1">
                      {risky ? <span title="Above p75" className="text-rose-400">⚠</span> : null}
                      <span>{r.category}</span>
                    </td>
                    <td className="py-2 pr-3">${r.median.toFixed(2)}</td>
                    <td className="py-2 pr-3">${r.p75.toFixed(2)}</td>
                    <td className="py-2 pr-3">${r.avg.toFixed(2)}</td>
                    <td className="py-2 pr-3">{r.sample_size}</td>
                    <td className="py-2 pr-3">{r.current_month !== undefined && r.current_month !== null ? `$${r.current_month.toFixed(2)}` : '-'}</td>
                    <td className="py-2 pr-0">
                      <div className="flex justify-end gap-2">
                        <button
                          className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-60"
                          disabled={busyRow === r.category}
                          title="Apply this category (Median)"
                          onClick={() => applySingleCategory(r.category, "median")}
                        >
                          {busyRow === r.category ? "…" : "Apply"}
                        </button>
                        <button
                          className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-60"
                          disabled={busyRow === r.category}
                          title="Apply this category (p75)"
                          onClick={() => applySingleCategory(r.category, "p75")}
                        >
                          p75
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
