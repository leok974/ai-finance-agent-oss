// Suggestions API client.
// IMPORTANT: Non-auth endpoints must NOT be prefixed with /api/. We rely on fetchJSON wrapper.
// Backend endpoint implemented at POST agent/tools/suggestions returning { items: Suggestion[] }
// This file was previously a hard-off stub; now it activates when the feature flag is enabled.

import { fetchJSON } from '@/lib/http';
import { FEATURES } from '@/config/featureFlags';

export interface Suggestion {
  kind: 'categorize';
  merchant: string;
  suggest_category: string;
  confidence: number; // 0..1
  support: number;    // raw count of matching unknowns
  example_txn_id?: number | null;
  month?: string | null; // yyyy-mm (latest month window evaluated)
}

export interface SuggestionQuery {
  month?: string;         // target month (yyyy-mm) to anchor unknowns window (optional)
  window_months?: number; // historical window size
  min_support?: number;   // minimum raw count threshold
  min_share?: number;     // minimum category share among unknowns (0..1)
  limit?: number;         // max items to return
}

export type SuggestionsMeta = Record<string, string> | undefined;

export async function fetchSuggestionsWithMeta(query: SuggestionQuery = {}): Promise<{ items: Suggestion[]; meta?: SuggestionsMeta }> {
  if (!FEATURES.suggestions) return { items: [] };
  const res = await fetchJSON('agent/tools/suggestions', { method: 'POST', body: JSON.stringify(query) }) as { items?: unknown; meta?: SuggestionsMeta } | undefined;
  if (!res) return { items: [] };
  const { items, meta } = res;
  if (!Array.isArray(items)) return { items: [], meta };
  const typed = items.filter(isSuggestionLike) as Suggestion[];
  return { items: typed, meta };
}

export async function fetchSuggestions(query: SuggestionQuery = {}): Promise<Suggestion[]> {
  const { items } = await fetchSuggestionsWithMeta(query);
  return items;
}

function isSuggestionLike(v: unknown): v is Suggestion {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return o.kind === 'categorize' && typeof o.merchant === 'string' && typeof o.suggest_category === 'string';
}

// Convenience hook-friendly loader (could expand later with react-query).
export async function getTopSuggestions(limit = 10): Promise<Suggestion[]> {
  return fetchSuggestions({ limit });
}

// Legacy names retained (no-ops when disabled) to avoid import crashes in older code paths.
export async function getRuleSuggestions(): Promise<Suggestion[]> {
  return fetchSuggestions();
}
export async function getRuleSuggestionsConfig(): Promise<{ enabled: boolean }> {
  return { enabled: !!FEATURES.suggestions };
}
export async function persistRuleSuggestion(): Promise<never> {
  // Not implemented in new flow (handled server-side upon accept flow in future roadmap)
  throw new Error('persistRuleSuggestion not implemented');
}
