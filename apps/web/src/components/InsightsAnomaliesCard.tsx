import * as React from "react";
import Card from "./Card";
import { getAnomalies, getAlerts, type Anomaly, type AlertsResponse } from "@/lib/api";
import { useMonth } from "@/context/MonthContext";
import CardHelpTooltip from "./CardHelpTooltip";
import { getHelpBaseText } from '@/lib/helpBaseText';

interface Props {
  refreshKey?: number;
}

export default function InsightsAnomaliesCard({ refreshKey = 0 }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<Anomaly[]>([]);
  const [month, setMonth] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [alerts, setAlerts] = React.useState<AlertsResponse | null>(null);
  const [alertsError, setAlertsError] = React.useState<string | null>(null);
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
  }, [selectedMonth, refreshKey]);

  // Load alerts separately
  React.useEffect(() => {
    let cancelled = false;
    if (!selectedMonth) return;

    (async () => {
      try {
        setAlertsError(null);
        const res = await getAlerts(selectedMonth);
        if (!cancelled) {
          setAlerts(res);
        }
      } catch (e: any) {
        if (!cancelled) {
          console.warn('[InsightsAnomaliesCard] Failed to load alerts', e);
          setAlertsError('Unable to load alerts');
        }
      }
    })();

    return () => { cancelled = true };
  }, [selectedMonth, refreshKey]);

  // Derived flags for "has anything unusual"
  const hasCategoryAnomalies = data.length > 0;
  const hasAlerts = alerts?.alerts && alerts.alerts.length > 0;
  const hasAnyUnusual = hasCategoryAnomalies || hasAlerts;

  // Primary alert (highest severity)
  const primaryAlert = hasAlerts
    ? [...alerts.alerts].sort((a, b) => {
        const severityOrder = { critical: 3, warning: 2, info: 1 };
        return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      })[0]
    : null;

  return (
    <div
      className="panel-no-border p-3 md:p-4 help-spot"
      data-explain-key="cards.insights"
      data-help-key="anomalies.month"
      data-month={month || undefined}
      data-help-id={month || undefined}
    >
      <Card className="border-0 bg-transparent shadow-none p-0">
      <div className="flex items-center justify-between mb-2">
  <h3 className="text-lg font-semibold flex items-center">⚠ Unusual this month <CardHelpTooltip cardId="cards.insights" month={month || undefined} ctx={{ data }} baseText={getHelpBaseText('cards.insights', { month: month || undefined })} className="ml-2" /></h3>
        {month && <span className="text-xs opacity-70">{month}</span>}
      </div>

      {/* Description text based on unusual activity */}
      {!loading && !err && (
        hasAnyUnusual ? (
          <p className="text-sm text-slate-200 mb-3">
            We found some unusual activity this month. Review the alerts and anomaly tables below for details.
          </p>
        ) : (
          <p className="text-sm text-slate-400 mb-3">
            No unusual categories or alerts this month. 🎉
          </p>
        )
      )}

      {/* Primary alert callout */}
      {primaryAlert && (
        <div className="mt-3 mb-4 rounded-lg bg-amber-500/10 border border-amber-500/40 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-amber-400">
              {primaryAlert.severity === "critical" ? "🔴" : "⚠️"}
            </span>
            <span className="font-medium text-amber-100">
              {primaryAlert.title}
            </span>
          </div>
          {primaryAlert.description && (
            <p className="mt-1 text-amber-100/90 text-xs">
              {primaryAlert.description}
            </p>
          )}
        </div>
      )}

      {loading && <div className="text-sm opacity-70">Scanning…</div>}
      {err && <div className="text-sm text-red-500">{err}</div>}

      {!loading && !err && hasCategoryAnomalies && (
        <section className="mb-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
            Anomalies — Categories
          </h4>
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
        </section>
      )}

      {/* Alerts Section */}
      <section className="mt-4 border-t border-white/10 pt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          Alerts — {alerts?.month ?? selectedMonth ?? 'Selected month'}
        </h4>

        {alertsError && (
          <p className="text-xs text-red-300 mb-2">
            {alertsError}
          </p>
        )}

        {!alerts && !alertsError && (
          <p className="text-xs text-slate-500">Checking for alerts…</p>
        )}

        {alerts && !hasAlerts && (
          <p className="text-xs text-slate-500">
            No alerts for this month.
          </p>
        )}

        {hasAlerts && (
          <ul className="space-y-1.5 text-xs">
            {alerts.alerts
              .filter((alert) => alert.code !== primaryAlert?.code) // Skip primary alert
              .slice(0, 3)
              .map((alert) => {
              const icon =
                alert.severity === 'critical' ? '🔴' :
                alert.severity === 'warning' ? '⚠️' : 'ℹ️';
              const textColor =
                alert.severity === 'critical' ? 'text-red-300' :
                alert.severity === 'warning' ? 'text-amber-300' : 'text-sky-300';

              return (
                <li key={alert.code} className="flex items-start gap-2">
                  <span className={textColor}>{icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{alert.title}</span>
                    {alert.description && (
                      <>
                        {' — '}
                        <span className="text-white/60">{alert.description}</span>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
            {alerts.alerts.length > 4 && (
              <li className="text-white/40">
                +{alerts.alerts.length - 4} more (open Alerts in ChatDock for details)
              </li>
            )}
          </ul>
        )}
      </section>
      </Card>
    </div>
  );
}
