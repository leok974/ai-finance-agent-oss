/**
 * Finance export types - lightweight, future-proof JSON structure
 */

export type FinanceExport = {
  version: "1.0";
  kind: "finance_quick_recap" | "finance_deep_dive";
  month: string; // "2025-11"
  generated_at: string; // ISO8601
  summary: {
    income: number; // Raw number, not formatted
    spend: number;
    net: number;
    top_merchant?: { name: string; amount: number };
    unknown?: { amount: number; count: number; top?: string[] };
  };
  categories?: Array<{ name: string; amount: number; note?: string }>; // deep-dive only
  spikes?: Array<{ date: string; merchant: string; amount: number; note?: string }>;
  source: {
    session_id: string;
    message_id: string; // The assistant reply id
  };
};
