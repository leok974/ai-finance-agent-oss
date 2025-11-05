// Shared TypeScript types for agent API responses and params

export type ISODate = string;        // e.g. "2025-10-31T12:00:00Z"
export type YearMonth = string;      // e.g. "2025-08"

export interface AgentSource {
  title?: string;
  url?: string;
  snippet?: string;
}

export interface AgentChatResponse {
  reply: string;
  model: string;                  // e.g. "gpt-oss:20b" or "deterministic"
  mode?: string;                  // "primary" | "nl_txns" | "tools" | etc.
  _router_fallback_active?: boolean;
  explain?: string;
  sources?: AgentSource[];
  fallback_reason?: string;
}

export interface AgentStatusResponse {
  ok: boolean;
  llm_ok: boolean;
  provider?: string;
  model?: string;
  base_url?: string;
}

export interface WhatIfParams {
  // Add any knobs you actually support; month is explicitly allowed:
  month?: YearMonth;
  budget?: number;
  cuts?: Array<{ category: string; pct: number }>;
  scenario?: string;
  adjustments?: Record<string, unknown>;
  [key: string]: unknown; // keep flexible for future flags
}

export interface WhatIfResult {
  // Shape this to whatever your API returns; here's a safe, flexible default:
  summary?: string;
  deltas?: Record<string, number>;
  notes?: string[];
  [key: string]: unknown;
}

export interface AgentPlanStatus {
  enabled: boolean;
  lastRunAt?: ISODate | null;
  openActions: number;
  queues?: string[];
  throttle?: {
    rate_per_min: number;
    capacity: number;
    tokens: number;
  } | null;
  // Add anything else you return, but avoid `any`
  [key: string]: unknown;
}

// Evidence types for transaction explanations
export interface RuleMatch {
  id: number;
  category: string;
}

export interface MerchantFeedback {
  merchant?: string;
  category?: string;
  confidence?: number;
  positives?: number;
  negatives?: number;
}

export interface FeedbackData {
  merchant_feedback?: MerchantFeedback[];
}

export interface Evidence {
  rule_match?: RuleMatch;
  feedback?: FeedbackData;
  merchant_norm?: string;
  [key: string]: unknown;
}

export interface ExplainSignalData {
  evidence?: Evidence;
  [key: string]: unknown;
}

// ML Status types
export interface MLStatusResponse {
  mtime_bumped?: boolean;
  label_used?: string;
  used_txn_id?: string;
  classes_after?: string[];
  classes_before?: string[];
  mtime_before?: string;
  mtime_after?: string;
  reason?: string;
  [key: string]: unknown;
}

// Transaction types
export interface Transaction {
  id?: string;
  date?: string;
  amount?: number;
  category?: string;
  note?: string;
  description?: string;
  [key: string]: unknown;
}

// Rule save response
export interface RuleSaveResponse {
  display_name?: string;
  [key: string]: unknown;
}

// Planner panel types
export interface PlannerItem {
  id: string;
  title?: string;
  status?: string;
  [key: string]: unknown;
}

export interface PlannerResponse {
  items?: PlannerItem[];
  throttle?: number;
  [key: string]: unknown;
}
