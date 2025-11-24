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
  getMonthCategories,
  getMonthFlows,
  getSpendingTrends,
  type UIMerchant,
  type UIDaily,
  type UICategory,
  type MonthSummaryResp
} from "../lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCurrency,
  formatCurrencyShort,
  formatDateLabel,
  formatLegendLabel,
  truncateMerchantLabel,
} from "@/lib/charts/formatters";
import {
  MONEY_Y_AXIS_PROPS,
  formatMoneyTick,
  AXIS_TICK_COLOR,
  GRID_LINE_COLOR,
} from "@/components/charts/utils";
import {
  normalizeAndGroupMerchantsForChart,
  type MerchantChartRow,
  type MerchantChartRowGrouped,
} from "@/lib/merchant-normalizer";
import { getMerchantAliasName } from "@/lib/formatters/merchants";
import { getCategoryColor } from "@/lib/categories";
import { SERIES_COLORS, CATEGORY_COLORS, getCategoryColor as getChartCategoryColor } from "@/lib/charts/theme";
import { getSpendBucket, getSpendBucketColor } from "@/lib/charts/spendBuckets";

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
  const [summary, setSummary] = useState<MonthSummaryResp | null>(null);
  const [merchants, setMerchants] = useState<UIMerchant[]>([]);
  const [categories, setCategories] = useState<UICategory[]>([]);
  const [daily, setDaily] = useState<UIDaily[]>([]);
  const [trends, setTrends] = useState<any | null>(null);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [_selectedCategory, setSelectedCategory] = useState<string | null>(null);
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
        const [s, m, c, d, t] = await Promise.all([
          getMonthSummary(month),
          getMonthMerchants(month),
          getMonthCategories(month),
          getMonthFlows(month),
          getSpendingTrends(6),
        ]);
        if (!alive) return;

        // Check if we have any data
        const hasData = s?.month || m.length > 0 || c.length > 0 || d.length > 0;
        if (!hasData) {
          setEmpty(true);
          setSummary(null);
          setMerchants([]);
          setCategories([]);
          setDaily([]);
          setTrends(t ?? null);
        } else {
          setSummary(s);
          setMerchants(m);
          setCategories(c);
          setDaily(d);
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
        } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
      }
    }
    window.addEventListener('open-category-chart', onOpenChart as any);
    return () => window.removeEventListener('open-category-chart', onOpenChart as any);
  }, []);

  const categoriesData = useMemo(() => categories, [categories]);

  const MIN_SPEND = 0.01;

  const topMerchantsData: MerchantChartRowGrouped[] = useMemo(() => {
    // Map backend API response to MerchantChartRow format
    const rawRows: MerchantChartRow[] = merchants.map((row: any) => {
      // Try multiple field names for total spend
      const rawValue =
        typeof row.total === 'number' ? row.total :
        typeof row.spend === 'number' ? row.spend :
        typeof row.amount === 'number' ? row.amount :
        0;

      // Prefer canonical fields from backend, fall back to legacy
      // Use getMerchantAliasName for clean display
      const merchantRaw =
        getMerchantAliasName(row) ||
        (row.merchant && String(row.merchant).trim()) ||
        'Unknown';

      return {
        merchantRaw,
        spend: Math.abs(rawValue),
        txns: Number(row.count ?? row.txn_count ?? row.transactions ?? 0),
        category: row.category ? String(row.category) : undefined,
      };
    });

    // Normalize and group (P2P merchants → "Transfers / P2P")
    return normalizeAndGroupMerchantsForChart(rawRows, MIN_SPEND);
  }, [merchants]);

  // Decide if we actually have merchant spend
  const hasMerchantData = topMerchantsData.some(
    (m) => Number.isFinite(m.spend) && m.spend >= MIN_SPEND
  );

  const flowsData = useMemo(() => daily, [daily]);
  const trendsData = useMemo(
    () => (trends?.trends ?? []).map((t: any) => ({
      month: t.month,
      spending: t.spending ?? t.spent ?? 0,
      income: t.income ?? 0,
      net: t.net ?? 0
    })),
    [trends]
  );

  // Max merchant spend for reference
  const maxMerchant = useMemo(() => Math.max(1, ...topMerchantsData.map((d) => d.spend)), [topMerchantsData]);

  const maxCategory = useMemo(() => Math.max(1, ...categoriesData.map((d: any) => Math.abs(Number(d?.amount ?? 0)))), [categoriesData]);

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

  // Spend legend component - shows color gradient for bar charts
  const SpendLegend: React.FC = () => (
    <div className="flex items-center gap-2 text-[11px] text-slate-400">
      <div className="flex items-center gap-1">
        <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "var(--chart-spend-low)" }} />
        <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "var(--chart-spend-mid)" }} />
        <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "var(--chart-spend-high)" }} />
      </div>
      <span className="font-medium">Spend</span>
      <span className="ml-1 text-slate-500">low → high</span>
    </div>
  );

  return (
    <div id="charts-panel" data-testid="charts-panel-root" className="grid gap-6 md:gap-7 grid-cols-1 lg:grid-cols-2">
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
          helpCtx={{ summary, merchants, flows: daily }}
          helpBaseText={getHelpBaseText('cards.overview', { month: resolvedMonth })}
          actions={<ExportMenu month={resolvedMonth} hasAnyTransactions={!!summary} hasUnknowns={false} />}
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
                {currency(Math.abs(summary.total_outflows || 0))}
              </div>
            </div>
            <div className="tile-no-border p-3">
              <div className="text-gray-400">{t('ui.metrics.total_income')}</div>
              <div className="mt-1 text-lg font-semibold text-emerald-300">
                {currency(summary.total_inflows || 0)}
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
  <Card className="border-0 bg-transparent shadow-none p-0" data-testid="top-categories-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="chart-title flex items-center">
            {t('ui.charts.top_categories_title', { month: resolvedMonth })}
            <CardHelpTooltip cardId="charts.top_categories" month={resolvedMonth} ctx={{ data: categoriesData }} baseText={getHelpBaseText('charts.top_categories', { month: resolvedMonth })} />
          </h3>
          <SpendLegend />
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
          <div className="h-64" data-testid="top-categories-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categoriesData}>
                <CartesianGrid stroke="var(--grid-line)" />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: AXIS_TICK_COLOR }}
                />
                {/* Shared money Y axis */}
                <YAxis {...MONEY_Y_AXIS_PROPS} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value: any) => [formatMoneyTick(Number(value)), 'Spend']}
                />
                <Bar dataKey="amount" name={t('ui.charts.legend_spend')} activeBar={{ fillOpacity: 1, stroke: "#fff", strokeWidth: 1 }} fillOpacity={0.9}>
                  {categoriesData.map((d: any, i: number) => {
                    const amount = Math.abs(Number(d?.amount ?? 0));
                    const bucket = getSpendBucket(amount, maxCategory);
                    return (
                      <Cell
                        key={`category-bar-${d?.category ?? d?.name ?? 'unknown'}-${i}`}
                        fill={getSpendBucketColor(bucket)}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
  </Card>
  </div>

  <div className="chart-card" data-explain-key="charts.month_merchants" data-month={resolvedMonth}>
  <Card className="border-0 bg-transparent shadow-none p-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="chart-title flex items-center">
            {t('ui.charts.merchants_title', { month: resolvedMonth })}
            <CardHelpTooltip cardId="charts.month_merchants" month={resolvedMonth} ctx={{ data: topMerchantsData }} baseText={getHelpBaseText('charts.month_merchants', { month: resolvedMonth })} />
          </h3>
          <SpendLegend />
        </div>
        {loading && (
          <div className="h-64">
            <div className="h-full w-full flex items-end gap-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="w-8" style={{ height: `${18 + (i % 4) * 14}%` }} />
              ))}
            </div>
          </div>
        )}
        {!loading && !hasMerchantData && (
          <div
            className="text-sm text-muted-foreground px-4 py-6"
            data-testid="top-merchants-empty"
          >
            No merchant data.
          </div>
        )}
        {!loading && hasMerchantData && (
          <div className="h-64" data-testid="top-merchants-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topMerchantsData}
                margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
                barCategoryGap={24}
              >
                {/* Subtle horizontal grid, like other cards */}
                <CartesianGrid
                  vertical={false}
                  stroke={GRID_LINE_COLOR}
                  strokeDasharray="3 3"
                />

                {/* Keep X axis hidden - merchant names come from tooltip */}
                <XAxis
                  dataKey="merchant"
                  hide
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: AXIS_TICK_COLOR }}
                />

                {/* Shared money Y axis */}
                <YAxis {...MONEY_Y_AXIS_PROPS} />

                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  formatter={(value: any, _name: any, props: any) => {
                    const payload = props?.payload ?? {};
                    // Use merchant field from normalized data
                    const merchantName = payload.merchant ?? 'Merchant';
                    const amount = value as number;
                    const suffix = payload.txns && payload.txns > 1 ? ` (${payload.txns} txns)` : '';

                    return [formatMoneyTick(amount) + suffix, merchantName];
                  }}
                  labelFormatter={() => ''}
                />
                <Bar
                  dataKey="spend"
                  radius={[8, 8, 0, 0]}
                  barSize={28}
                  activeBar={{ fillOpacity: 1, stroke: "#fff", strokeWidth: 1 }}
                  fillOpacity={0.9}
                >
                  {topMerchantsData.map((d, i: number) => {
                    const bucket = getSpendBucket(d.spend, maxMerchant);
                    return (
                      <Cell
                        key={`merchant-bar-${d.merchant}-${i}`}
                        fill={getSpendBucketColor(bucket)}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: AXIS_TICK_COLOR }}
                  tickFormatter={formatDateLabel}
                />
                {/* Shared money Y axis */}
                <YAxis {...MONEY_Y_AXIS_PROPS} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value: any, key: string) => [
                    formatMoneyTick(Number(value)),
                    key === 'in' ? 'Income' : key === 'out' ? 'Spend' : 'Net',
                  ]}
                  labelFormatter={formatDateLabel}
                />
                <Legend
                  wrapperStyle={legendTextStyle}
                  formatter={formatLegendLabel}
                />
                <Line type="monotone" dataKey="in"  name="in"  stroke={SERIES_COLORS.income} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="out" name="out" stroke={SERIES_COLORS.spend} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net" name="net" stroke={SERIES_COLORS.net} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
  </Card>
  </div>

  <div
    id="card-spending-trends"
    data-testid="card-spending-trends"
    className="chart-card"
    data-explain-key="charts.spending_trends"
  >
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
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: AXIS_TICK_COLOR }}
                />
                {/* Shared money Y axis */}
                <YAxis {...MONEY_Y_AXIS_PROPS} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value: any, key: string) => [
                    formatMoneyTick(Number(value)),
                    key === 'income' ? 'Income' : key === 'spending' ? 'Spending' : 'Net'
                  ]}
                />
                <Legend wrapperStyle={legendTextStyle} />
                <Line type="monotone" dataKey="spending" name="Spending" stroke={SERIES_COLORS.spend} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="income" name="Income" stroke={SERIES_COLORS.income} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net" name="Net" stroke={SERIES_COLORS.net} strokeWidth={2} dot={false} />
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
