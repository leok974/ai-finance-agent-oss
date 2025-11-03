import type { ChartsMonthReq, ChartsSummary, SpendingTrendsReq, LatestMonthResp, YearMonth, ChartPoint } from './types';
import { fetchJSON } from '@/lib/http';

export async function resolveLatestMonth(): Promise<YearMonth | null> {
  try {
    const data = await fetchJSON<LatestMonthResp>('/agent/tools/meta/latest_month');
    return data.month ?? null;
  } catch { return null; }
}

async function postJSON<T>(path: string, body: unknown): Promise<T | null> {
  try {
    return await fetchJSON<T>(path, { method: 'POST', body: JSON.stringify(body) });
  } catch { return null; }
}

export async function postSummary(month: YearMonth): Promise<ChartsSummary | null> {
  return postJSON<ChartsSummary>('/agent/tools/charts/summary', { month } satisfies ChartsMonthReq);
}

export async function postSpendingTrends(months: YearMonth[]): Promise<ChartPoint[] | null> {
  return postJSON<ChartPoint[]>('/agent/tools/charts/spending_trends', { months } satisfies SpendingTrendsReq);
}
