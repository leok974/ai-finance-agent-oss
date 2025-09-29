import React, { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import ExportMenu from "./ExportMenu";
import CardHelpTooltip from "./CardHelpTooltip";
import { getHelpBaseText } from '@/lib/helpBaseText';
import CardHeaderRow from "./CardHeaderRow";
import EmptyState from "./EmptyState";
import { t } from '@/lib/i18n';
import * as RC from "recharts";
import {
  getMonthSummary,
  getMonthMerchants,
  getMonthFlows,
  getSpendingTrends,
} from "../lib/api";
import { Skeleton } from "@/components/ui/skeleton";

// Cast so TS treats them as FCs (safe for now)
const ResponsiveContainer = RC.ResponsiveContainer as unknown as React.FC<any>;
const CartesianGrid = RC.CartesianGrid as unknown as React.FC<any>;
const XAxis = RC.XAxis as unknown as React.FC<any>;
const YAxis = RC.YAxis as unknown as React.FC<any>;
const Tooltip = RC.Tooltip as unknown as React.FC<any>;
const Legend = RC.Legend as unknown as React.FC<any>;
const BarChart = RC.BarChart as unknown as React.FC<any>;
const Bar = RC.Bar as unknown as React.FC<any>;
const LineChart = RC.LineChart as unknown as React.FC<any>;
const Line = RC.Line as unknown as React.FC<any>;
const Cell = RC.Cell as unknown as React.FC<any>;

interface Props {
  /** Required: charts endpoints require month */
  month: string;
  refreshKey?: number;
}

const currency = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const ChartsPanel: React.FC<Props> = ({ month, refreshKey = 0 }) => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any | null>(null);
  const [merchants, setMerchants] = useState<any | null>(null);
  const [flows, setFlows] = useState<any | null>(null);
  const [trends, setTrends] = useState<any | null>(null);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [monthsWindow, setMonthsWindow] = useState<number>(6);

  // resolvedMonth prefers server-returned month, falls back to prop
  const resolvedMonth = summary?.month ?? month;

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      setError(null);
      setEmpty(false);
      try {
        const [s, m, f, t] = await Promise.all([
          getMonthSummary(month),
          getMonthMerchants(month),
          getMonthFlows(month),
          getSpendingTrends(6),
        ]);
        if (!alive) return;
        // consider backend-empty cases: nulls from 400 handler, or objects with month: null
        const isEmpty = (!s && !m && !f) || ((s?.month ?? null) === null && (m?.month ?? null) === null && (f?.month ?? null) === null);
        if (isEmpty) {
          setEmpty(true);
          setSummary(null);
          setMerchants(null);
          setFlows(null);
          setTrends(t ?? null);
        } else {
          setSummary(s);
          setMerchants(m);
          setFlows(f);
          setTrends(t);
        }
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? String(e));
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [month, refreshKey]);

  // Optional: allow opening a specific category chart from AgentChat
  useEffect(() => {
    function onOpenChart(e: Event) {
      const { category, months } = (e as CustomEvent).detail || {};
      if (category) {
        try {
          setSelectedCategory(String(category));
          setMonthsWindow(Number(months ?? 6));
          // Scroll to this panel's root
          document.getElementById('charts-panel')?.scrollIntoView?.({ behavior: 'smooth' });
        } catch {}
      }
    }
    window.addEventListener('open-category-chart', onOpenChart as any);
    return () => window.removeEventListener('open-category-chart', onOpenChart as any);
  }, []);

  const categoriesData = useMemo(() => summary?.categories ?? [], [summary]);
  const merchantsData = useMemo(() => merchants?.merchants ?? [], [merchants]);
  const flowsData = useMemo(() => flows?.series ?? [], [flows]);
  const trendsData = useMemo(
    () => (trends?.trends ?? []).map((t: any) => ({ month: t.month, spent: t.spent ?? t.spending ?? 0 })),
    [trends]
  );

  // Color helpers for bars
  function pickColor(v: number, max: number) {
    if (!Number.isFinite(max) || max <= 0) return "#60a5fa"; // blue fallback
    const pct = Math.abs(v) / max;
    if (pct <= 0.33) return "#22c55e";   // green-500
    if (pct <= 0.66) return "#f59e0b";   // amber-500
    return "#ef4444";                    // red-500
  }
  const maxCategory = useMemo(() => Math.max(1, ...categoriesData.map((d: any) => Math.abs(Number(d?.amount ?? 0)))), [categoriesData]);
  const maxMerchant = useMemo(() => Math.max(1, ...merchantsData.map((d: any) => Math.abs(Number(d?.amount ?? 0)))), [merchantsData]);

  // Dark tooltip style
  const tooltipStyle = useMemo(() => ({
    backgroundColor: "rgba(17,24,39,.95)",
    border: "1px solid rgba(255,255,255,.1)",
    borderRadius: 8,
    color: "#fff",
    boxShadow: "0 6px 18px rgba(0,0,0,.35)",
  } as const), []);
  const tooltipItemStyle = useMemo(() => ({ color: "#fff" } as const), []);
  const tooltipLabelStyle = useMemo(() => ({ color: "#fff" } as const), []);
  const legendTextStyle = useMemo(() => ({ color: "#e5e7eb" } as const), []);

  // Custom legend for bar charts to reflect multi-color palette
  const BarPaletteLegend: React.FC<{ label?: string }> = ({ label = "Spend" }) => (
    <div className="flex items-center gap-3 text-xs" style={{ color: "#e5e7eb" }}>
      <span className="opacity-90">{label}</span>
      <div className="flex items-center gap-1">
        <span className="inline-block w-3 h-3 rounded-[2px]" style={{ backgroundColor: "#22c55e" }} />
        <span className="inline-block w-3 h-3 rounded-[2px]" style={{ backgroundColor: "#f59e0b" }} />
        <span className="inline-block w-3 h-3 rounded-[2px]" style={{ backgroundColor: "#ef4444" }} />
      </div>
      <span className="opacity-60">low → high</span>
    </div>
  );

  return (
    <div id="charts-panel" className="grid gap-6 md:gap-7 grid-cols-1 lg:grid-cols-2">
      {empty && !error && (
        <div className="lg:col-span-2">
          <EmptyState title={t('ui.empty.no_transactions_title')} note={t('ui.empty.charts_note')} />
        </div>
      )}
  <div className="chart-card" data-explain-key="cards.overview" data-month={resolvedMonth}>
  <Card className="border-0 bg-transparent shadow-none p-0">
        <CardHeaderRow
          title={t('ui.charts.overview_title', { month: resolvedMonth })}
          helpKey="cards.overview"
          month={resolvedMonth}
          helpCtx={{ summary, merchants, flows }}
          helpBaseText={getHelpBaseText('cards.overview', { month: resolvedMonth })}
          actions={<ExportMenu month={resolvedMonth} />}
          className="mb-2"
        />
        {loading && (
          <div className="grid grid-cols-3 gap-4 text-sm">
            {[0, 1, 2].map((i) => (
              <div key={i} className="tile-no-border p-3">
                <Skeleton className="h-4 w-24" />
                <div className="mt-2">
                  <Skeleton className="h-6 w-28" />
                </div>
              </div>
            ))}
          </div>
        )}
        {error && !empty && <p className="text-sm text-rose-300">Error: {error}</p>}
        {!loading && !error && summary && (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="tile-no-border p-3">
              <div className="text-gray-400">{t('ui.metrics.total_spend')}</div>
              <div className="mt-1 text-lg font-semibold text-rose-300">
                {currency(summary.total_spend || 0)}
              </div>
            </div>
            <div className="tile-no-border p-3">
              <div className="text-gray-400">{t('ui.metrics.total_income')}</div>
              <div className="mt-1 text-lg font-semibold text-emerald-300">
                {currency(summary.total_income || 0)}
              </div>
            </div>
            <div className="tile-no-border p-3">
              <div className="text-gray-400">{t('ui.metrics.net')}</div>
              <div className="mt-1 text-lg font-semibold text-indigo-300">
                {currency(summary.net || 0)}
              </div>
            </div>
          </div>
        )}
  </Card>
  </div>

  <div className="chart-card" data-explain-key="charts.top_categories" data-month={resolvedMonth}>
  <Card className="border-0 bg-transparent shadow-none p-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="chart-title flex items-center">
            {t('ui.charts.top_categories_title', { month: resolvedMonth })}
            <CardHelpTooltip cardId="charts.top_categories" month={resolvedMonth} ctx={{ data: categoriesData }} baseText={getHelpBaseText('charts.top_categories', { month: resolvedMonth })} />
          </h3>
        </div>
        {loading && (
          <div className="h-64">
            <div className="h-full w-full flex items-end gap-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="w-8" style={{ height: `${20 + (i % 5) * 12}%` }} />
              ))}
            </div>
          </div>
        )}
        {!loading && categoriesData.length === 0 && (
          <p className="text-sm text-gray-400">{t('ui.charts.empty_categories')}</p>
        )}
        {!loading && categoriesData.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoriesData}>
                <CartesianGrid stroke="var(--grid-line)" />
                <XAxis dataKey="name" tick={{ fill: "var(--text-muted)" }} stroke="var(--border-subtle)" />
                <YAxis
                  tick={{ fill: "var(--text-muted)" }}
                  stroke="var(--border-subtle)"
                  label={{ value: t('ui.charts.axis_spend'), angle: -90, position: "insideLeft", fill: "var(--text-muted)" }}
                />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend content={<BarPaletteLegend label={t('ui.charts.legend_spend')} />} />
                <Bar dataKey="amount" name={t('ui.charts.legend_spend')} activeBar={{ fillOpacity: 1, stroke: "#fff", strokeWidth: 1 }} fillOpacity={0.9}>
                  {categoriesData.map((d: any, i: number) => (
                    <Cell key={i} fill={pickColor(Number(d?.amount ?? 0), maxCategory)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
  </Card>
  </div>

  <div className="chart-card" data-explain-key="charts.month_merchants" data-month={resolvedMonth}>
  <Card className="border-0 bg-transparent shadow-none p-0">
        <CardHeaderRow
          title={t('ui.charts.merchants_title', { month: resolvedMonth })}
          helpKey="charts.month_merchants"
          month={resolvedMonth}
          helpCtx={{ data: merchantsData }}
          helpBaseText={getHelpBaseText('charts.month_merchants', { month: resolvedMonth })}
          className="mb-2"
        />
        {loading && (
          <div className="h-64">
            <div className="h-full w-full flex items-end gap-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="w-8" style={{ height: `${18 + (i % 4) * 14}%` }} />
              ))}
            </div>
          </div>
        )}
        {!loading && merchantsData.length === 0 && (
          <p className="text-sm text-gray-400">{t('ui.charts.empty_merchants')}</p>
        )}
        {!loading && merchantsData.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={merchantsData}>
                <CartesianGrid stroke="var(--grid-line)" />
                <XAxis dataKey="merchant" tick={{ fill: "var(--text-muted)" }} stroke="var(--border-subtle)" />
                <YAxis
                  tick={{ fill: "var(--text-muted)" }}
                  stroke="var(--border-subtle)"
                  label={{ value: t('ui.charts.axis_spend'), angle: -90, position: "insideLeft", fill: "var(--text-muted)" }}
                />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend content={<BarPaletteLegend label={t('ui.charts.legend_spend')} />} />
                <Bar dataKey="amount" name={t('ui.charts.legend_spend')} activeBar={{ fillOpacity: 1, stroke: "#fff", strokeWidth: 1 }} fillOpacity={0.9}>
                  {merchantsData.map((d: any, i: number) => (
                    <Cell key={i} fill={pickColor(Number(d?.amount ?? 0), maxMerchant)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Tip removed per request */}
          </div>
        )}
  </Card>
  </div>

  <div className="chart-card" data-explain-key="charts.daily_flows" data-month={resolvedMonth}>
  <Card className="border-0 bg-transparent shadow-none p-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="chart-title flex items-center">
            {t('ui.charts.daily_flows_title', { month: resolvedMonth })}
            <CardHelpTooltip cardId="charts.daily_flows" month={resolvedMonth} ctx={{ data: flowsData }} baseText={getHelpBaseText('charts.daily_flows', { month: resolvedMonth })} />
          </h3>
        </div>
        {loading && (
          <div className="h-64">
            <div className="h-full w-full flex items-center">
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        )}
        {!loading && flowsData.length === 0 && (
          <p className="text-sm text-gray-400">{t('ui.charts.empty_flows')}</p>
        )}
        {!loading && flowsData.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={flowsData}>
                <CartesianGrid stroke="var(--grid-line)" />
                <XAxis dataKey="date" tick={{ fill: "var(--text-muted)" }} stroke="var(--border-subtle)" />
                <YAxis
                  tick={{ fill: "var(--text-muted)" }}
                  stroke="var(--border-subtle)"
                  label={{ value: t('ui.charts.axis_amount'), angle: -90, position: "insideLeft", fill: "var(--text-muted)" }}
                />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={legendTextStyle} />
                <Line type="monotone" dataKey="in"  name={t('ui.charts.line_in')}  stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="out" name={t('ui.charts.line_out')} stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net" name={t('ui.charts.line_net')} stroke="#60a5fa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
  </Card>
  </div>

  <div className="chart-card" data-explain-key="charts.spending_trends">
  <Card className="border-0 bg-transparent shadow-none p-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="chart-title flex items-center">
            {t('ui.charts.spending_trends_title', { months: monthsWindow })}
            <CardHelpTooltip cardId="charts.spending_trends" month={resolvedMonth} ctx={{ data: trendsData }} baseText={getHelpBaseText('charts.spending_trends', { monthsWindow })} />
          </h3>
        </div>
        {loading && (
          <div className="h-64">
            <div className="h-full w-full flex items-center">
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        )}
        {!loading && trendsData.length === 0 && (
          <p className="text-sm text-gray-400">{t('ui.charts.empty_trends')}</p>
        )}
        {!loading && trendsData.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendsData}>
                <CartesianGrid stroke="var(--grid-line)" />
                <XAxis dataKey="month" tick={{ fill: "var(--text-muted)" }} stroke="var(--border-subtle)" />
                <YAxis
                  tick={{ fill: "var(--text-muted)" }}
                  stroke="var(--border-subtle)"
                  label={{ value: t('ui.charts.axis_spend'), angle: -90, position: "insideLeft", fill: "var(--text-muted)" }}
                />
                <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                <Legend wrapperStyle={legendTextStyle} />
                <Line type="monotone" dataKey="spent" name="Spent" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
  </Card>
  </div>
    </div>
  );
};

export default ChartsPanel;
