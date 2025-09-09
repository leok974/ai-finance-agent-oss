export type RuleSuggestion = {
  id: number;
  merchant_norm: string;
  category: string;
  support: number;
  positive_rate: number;
  last_seen: string | null;
  created_at: string | null;
};
