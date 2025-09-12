// Persisted rule suggestion (server-stored)
export type PersistedRuleSuggestion = {
  id: number;
  merchant_norm: string;
  category: string;
  support: number;
  positive_rate: number;
  last_seen: string | null;
  created_at: string | null;
};

// Mined rule suggestion (summary list)
export type RuleSuggestion = {
  merchant: string;
  category: string;
  count: number;
  window_days: number;
  sample_txn_ids?: number[];
  recent_month_key?: string;
};

export function isRuleSuggestionArray(x: unknown): x is RuleSuggestion[] {
  return Array.isArray(x) && x.every(
    (it) =>
      it &&
      typeof (it as any).merchant === "string" &&
      typeof (it as any).category === "string" &&
      typeof (it as any).count === "number" &&
      typeof (it as any).window_days === "number"
  );
}
