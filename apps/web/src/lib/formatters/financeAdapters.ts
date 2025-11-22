/**
 * Adapters to transform API responses into MonthSummary format
 */

import type { MonthSummary } from './finance';

/**
 * Transform charts/summary API response into MonthSummary
 * NOTE: This should preferably use insightsExpanded data when available
 * as it contains richer information (unknowns, categories, anomalies)
 */
export function adaptChartsSummaryToMonthSummary(
  raw: any,
  month: string
): MonthSummary {
  // Extract basic financials
  const income = raw?.income ?? raw?.summary?.income ?? raw?.total_in ?? raw?.total_inflows ?? 0;
  const spend = Math.abs(raw?.spend ?? raw?.summary?.spend ?? raw?.total_out ?? raw?.total_outflows ?? 0);
  const net = raw?.net ?? raw?.summary?.net ?? (income - spend);

  // Extract top merchant
  const topMerchants = raw?.top_merchants ?? raw?.merchants ?? [];
  const topMerchant = topMerchants[0] || { merchant: 'N/A', amount: 0 };

  // Extract unknown transactions - handle both summary and expanded formats
  const unknownSpend = raw?.unknown_spend ?? raw?.unlabeled ?? {};
  const unknown = {
    amount: Math.abs(unknownSpend?.amount ?? 0),
    count: unknownSpend?.count ?? unknownSpend?.transactions ?? 0,
    top: unknownSpend?.top_merchants ?? unknownSpend?.top ?? []
  };

  // Extract top categories
  const topCats = raw?.top_categories ?? raw?.categories ?? [];
  const categories = topCats.map((c: any) => ({
    name: c?.category ?? c?.name ?? 'Unknown',
    amount: Math.abs(c?.amount ?? c?.total ?? c?.spend ?? 0),
    note: c?.note ?? undefined
  }));

  // Extract anomalies/spikes
  const anomalies = raw?.anomalies?.categories ?? raw?.anomalies?.merchants ?? raw?.spikes ?? raw?.large_transactions ?? [];
  const spikes = anomalies.slice(0, 5).map((a: any) => ({
    date: a?.date ?? 'Unknown',
    merchant: a?.merchant ?? a?.name ?? 'Unknown',
    amount: Math.abs(a?.amount ?? 0),
    note: a?.note ?? a?.reason ?? undefined
  }));

  return {
    month,
    month_id: raw?.month_id ?? raw?.month ?? month, // derive from API or fallback to month param
    income,
    spend,
    net,
    topMerchant: {
      name: topMerchant?.merchant ?? topMerchant?.name ?? 'N/A',
      amount: Math.abs(topMerchant?.amount ?? topMerchant?.spend ?? topMerchant?.total ?? 0)
    },
    unknown,
    categories,
    spikes: spikes.length > 0 ? spikes : undefined
  };
}

/**
 * Transform insightsExpanded API response into MonthSummary
 * This is the PREFERRED adapter as it has all the rich data we need
 */
export function adaptInsightsExpandedToMonthSummary(
  raw: any,
  month: string
): MonthSummary {
  // Extract basic financials from summary object
  const summary = raw?.summary ?? {};
  const income = summary?.income ?? 0;
  const spend = Math.abs(summary?.spend ?? 0);
  const net = summary?.net ?? (income - spend);

  // Extract top merchant
  const topMerchants = raw?.top_merchants ?? [];
  const topMerchant = topMerchants[0];

  // Extract unknown transactions
  const unknownSpend = raw?.unknown_spend ?? {};
  const unknown = {
    amount: Math.abs(unknownSpend?.amount ?? 0),
    count: unknownSpend?.count ?? 0,
    top: unknownSpend?.top_merchants ?? []
  };

  // Extract top categories
  const topCats = raw?.top_categories ?? [];
  const categories = topCats.map((c: any) => ({
    name: c?.category ?? 'Unknown',
    amount: Math.abs(c?.amount ?? 0),
    note: c?.note ?? undefined
  }));

  // Extract top merchants
  const merchants = topMerchants.map((m: any) => ({
    name: m?.merchant ?? 'Unknown',
    amount: Math.abs(m?.amount ?? 0),
    category: m?.category ?? undefined
  }));

  // Extract anomalies from both categories and merchants
  const catAnomalies = raw?.anomalies?.categories ?? [];
  const merchAnomalies = raw?.anomalies?.merchants ?? [];
  const allAnomalies = [...catAnomalies, ...merchAnomalies];

  const spikes = allAnomalies.slice(0, 5).map((a: any) => ({
    date: a?.period ?? raw?.month ?? month,
    merchant: a?.merchant ?? a?.category ?? 'Unknown',
    amount: Math.abs(a?.current ?? a?.amount ?? 0),
    note: a?.delta_pct ? `${a.delta_pct > 0 ? '+' : ''}${(a.delta_pct * 100).toFixed(0)}% vs prev` : undefined
  }));

  return {
    month: raw?.month ?? month,
    month_id: raw?.month ?? month,
    income,
    spend,
    net,
    topMerchant: topMerchant ? {
      name: topMerchant?.merchant ?? 'N/A',
      amount: Math.abs(topMerchant?.amount ?? 0)
    } : { name: 'N/A', amount: 0 },
    unknown,
    categories,
    merchants,
    spikes: spikes.length > 0 ? spikes : undefined
  };
}
