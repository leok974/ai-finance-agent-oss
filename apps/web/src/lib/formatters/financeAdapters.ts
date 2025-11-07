/**
 * Adapters to transform API responses into MonthSummary format
 */

import type { MonthSummary } from './finance';

/**
 * Transform charts/summary API response into MonthSummary
 */
export function adaptChartsSummaryToMonthSummary(
  raw: any,
  month: string
): MonthSummary {
  // Extract basic financials
  const income = raw?.income ?? raw?.total_in ?? raw?.total_inflows ?? 0;
  const spend = Math.abs(raw?.spend ?? raw?.total_out ?? raw?.total_outflows ?? 0);
  const net = raw?.net ?? (income - spend);

  // Extract top merchant
  const topMerchants = raw?.top_merchants ?? raw?.merchants ?? [];
  const topMerchant = topMerchants[0] || { merchant: 'N/A', amount: 0 };

  // Extract unknown transactions
  const unknownSpend = raw?.unknown_spend ?? raw?.unlabeled ?? {};
  const unknown = {
    amount: Math.abs(unknownSpend?.amount ?? 0),
    count: unknownSpend?.count ?? unknownSpend?.transactions ?? 0,
    top: unknownSpend?.top_merchants ?? []
  };

  // Extract top categories
  const topCats = raw?.top_categories ?? raw?.categories ?? [];
  const categories = topCats.map((c: any) => ({
    name: c?.category ?? c?.name ?? 'Unknown',
    amount: Math.abs(c?.amount ?? c?.total ?? c?.spend ?? 0),
    note: c?.note ?? undefined
  }));

  // Extract anomalies/spikes
  const anomalies = raw?.anomalies ?? raw?.spikes ?? raw?.large_transactions ?? [];
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
