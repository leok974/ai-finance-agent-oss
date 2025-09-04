// src/types/agentToolsResults.ts
export type Txn = {
  id: number | string;
  date?: string; // ISO
  merchant?: string;
  description?: string;
  amount?: number; // negative = spend
  category?: string | null;
};

export type TransactionsSearchResult = {
  total?: number;
  items: Txn[];
};

export type CategorizeResult = {
  updated: Array<{ id: number | string; category: string }>;
  skipped?: number;
};

export type BudgetSummaryResult = {
  month?: string;
  totals: Array<{ category: string; budget?: number | null; actual: number }>;
};

export type BudgetCheckResult = {
  month?: string;
  utilization: Array<{
    category: string;
    budget?: number | null;
    actual: number;
    ratio: number; // guaranteed JSON-safe (no Infinity)
  }>;
};

export type InsightSummaryResult = {
  month?: string;
  summary?: { income: number; spend: number; net: number };
  unknownSpend?: { count: number; amount: number };
  topCategories?: Array<{ category: string; amount: number }>;
  topMerchants?: Array<{ merchant: string; amount: number }>;
  largeTransactions?: Txn[];
};

export type ChartsSummaryResult = {
  month?: string;
  income: number;
  spend: number;
  net: number;
};

export type ChartsMerchantsResult = {
  month?: string;
  merchants: Array<{ merchant: string; amount: number }>;
};

export type ChartsFlowsResult = {
  month?: string;
  inflow: Array<{ name: string; amount: number }>;
  outflow: Array<{ name: string; amount: number }>;
};

export type ChartsTrendsResult = {
  series: Array<{ month: string; income: number; spend: number; net: number }>;
};

export type RulesTestResult = {
  rule: { merchant?: string; description?: string; pattern?: string; category?: string };
  matched: Txn[];
};
export type RulesApplyResult = {
  applied: number;
  preview?: number;
};

// --- Insights: Expanded ---
export type MoMStat = { curr: number; prev: number; delta: number; pct: number | null };

export type InsightsExpandedResult = {
  month: string | null;
  prev_month: string | null;
  summary: { income: number; spend: number; net: number } | null;
  mom: { income: MoMStat; spend: MoMStat; net: MoMStat } | null;
  unknown_spend: { count: number; amount: number } | null;
  top_categories: Array<{ category: string; amount: number }>;
  top_merchants: Array<{ merchant: string; amount: number }>;
  large_transactions: Array<{
    id: number | string;
    date?: string | null;
    merchant?: string | null;
    description?: string | null;
    amount: number;
    category?: string | null;
  }>;
  anomalies: {
    categories: Array<{ key: string; curr: number; prev: number; delta: number; pct: number | null }>;
    merchants: Array<{ key: string; curr: number; prev: number; delta: number; pct: number | null }>;
  };
};
