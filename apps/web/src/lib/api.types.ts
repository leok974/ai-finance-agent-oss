/**
 * API Response Types
 *
 * Centralized type definitions for API responses to eliminate `any` types
 * and provide runtime validation where needed.
 */

export type MonthSummary = {
  label: string;
  month: string;
  total_out_cents?: number;
  total_out?: number;
  total_in_cents?: number;
  total_in?: number;
  anomalies_count?: number;
};

export type TopMerchant = {
  merchant: string;
  spend?: number;
  total?: number;
};

export type MerchantsResponse = {
  top_merchants?: TopMerchant[];
  merchants_count?: number;
};

export type GreetingPayload = {
  summary?: MonthSummary;
  merchants?: MerchantsResponse;
};
