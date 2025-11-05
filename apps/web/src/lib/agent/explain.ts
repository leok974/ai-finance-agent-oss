/**
 * Agent explanation helpers for fetching card explanations
 */

import { fetchJSON } from '@/lib/http';

export type ExplainResponse = {
  explain?: string;
  why?: string;
  reply?: string;
  text?: string;
  sources?: Array<{ title?: string; url?: string }>;
  reasons?: string[];  // ["rag", "llm", "heuristic", "fallback"]
  grounded?: boolean;  // True if RAG/LLM was used, false if heuristic only
};

export type ExplainParams = {
  cardId: string;
  month?: string | null;
  metricId?: string;
  ctx?: Record<string, unknown>;
};

/**
 * Fetch explanation for a card
 * @param params - Card identification and context
 * @param signal - Optional AbortSignal for cancellation
 * @returns Explanation response with text and optional sources
 */
export async function fetchCardExplain(
  params: ExplainParams,
  signal?: AbortSignal
): Promise<ExplainResponse> {
  try {
    const payload: Record<string, unknown> = {
      card_id: params.cardId,
      rephrase: true,
    };

    if (params.month) payload.month = params.month;
    if (params.metricId) payload.metric_id = params.metricId;
    if (params.ctx) payload.ctx = params.ctx;

    const data = await fetchJSON<ExplainResponse>(`agent/describe/${encodeURIComponent(params.cardId)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });

    return {
      explain: data?.explain ?? data?.why ?? data?.reply ?? data?.text,
      sources: data?.sources,
      reasons: data?.reasons,
      grounded: data?.grounded,
    };
  } catch {
    return {};
  }
}
