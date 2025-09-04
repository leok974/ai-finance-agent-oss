// --- src/types/agentTools.ts ---
export type ToolKey =
  | "transactions.search"
  | "transactions.categorize"
  | "transactions.get_by_ids"
  | "budget.summary"
  | "budget.check"
  | "insights.summary"
  | "charts.summary"
  | "charts.merchants"
  | "charts.flows"
  | "charts.trends"
  | "rules.test"
  | "rules.apply";

export type ToolSpec = {
  key: ToolKey;
  label: string;
  path: string;
  examplePayload: any;
};

export type ToolRunState<T = unknown> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};
