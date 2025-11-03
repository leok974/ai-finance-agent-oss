/**
 * Agent status helpers for checking LLM availability
 */

import { fetchJSON } from '@/lib/http';

export type AgentStatus = {
  ok: boolean;
  llm_ok: boolean;
  provider?: string;
  model?: string;
};

/**
 * Fetch agent status to check if LLM is available
 * @param signal - Optional AbortSignal for cancellation
 * @returns AgentStatus with llm_ok flag
 */
export async function fetchAgentStatus(signal?: AbortSignal): Promise<AgentStatus> {
  try {
    const data = await fetchJSON<AgentStatus>('agent/status', { signal });
    return {
      ok: data?.ok ?? false,
      llm_ok: data?.llm_ok ?? false,
      provider: data?.provider,
      model: data?.model,
    };
  } catch {
    return { ok: false, llm_ok: false };
  }
}
