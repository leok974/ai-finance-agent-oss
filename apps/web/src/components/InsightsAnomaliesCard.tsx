import * as React from "react";
import Card from "./Card";
import { getAnomalies, type Anomaly } from "@/lib/api";
import { useMonth } from "@/context/MonthContext";
import HelpBadge from "./HelpBadge";

export default function InsightsAnomaliesCard() {
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<Anomaly[]>([]);
  const [month, setMonth] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const { month: selectedMonth } = useMonth();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const res = await getAnomalies({ months: 6, min: 50, threshold: 0.4, max: 6, month: selectedMonth || undefined });
        if (cancelled) return;
        setMonth(res.month);
        setData(res.anomalies ?? []);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ?? "Failed to load anomalies");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true };
  }, [selectedMonth]);

  return (
    <div
      className="panel-no-border p-3 md:p-4 help-spot"
      data-explain-key="cards.insights"
      data-help-target="card.insights"
      data-month={month || undefined}
    >
      <Card className="border-0 bg-transparent shadow-none p-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold flex items-center">⚠ Unusual this month <HelpBadge k="cards.insights" className="ml-2" /></h3>
        {month && <span className="text-xs opacity-70">{month}</span>}
      </div>

      {loading && <div className="text-sm opacity-70">Scanning…</div>}
      {err && <div className="text-sm text-red-500">{err}</div>}

      {!loading && !err && (
        data.length ? (
          <ul className="space-y-1">
            {data.map((a) => {
              const pct = Math.round(a.pct_from_median * 100);
              const badge = a.direction === "high" ? "bg-yellow-500/20" : "bg-cyan-500/20";
              return (
                <li key={a.category} className="flex items-center justify-between border-t border-border/50 py-2 first:border-t-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${badge}`}>
                      {a.direction === "high" ? "High" : "Low"}
                    </span>
                    <span className="font-medium">{a.category}</span>
                  </div>
                  <div className="text-sm opacity-80">
                    ${a.current.toFixed(2)} <span className="opacity-60">vs</span> ${a.median.toFixed(2)}
                    <span className="ml-2">{pct > 0 ? `+${pct}%` : `${pct}%`}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-sm opacity-70">No unusual categories this month.</div>
        )
      )}
      </Card>
    </div>
  );
}
