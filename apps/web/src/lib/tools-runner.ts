import { agentRephrase } from "./api";

// ============================================================================
// Analytics Response Types
// ============================================================================

export type SubscriptionItem = {
  merchant: string;
  count: number;
  avg_amount: number;
  median_gap_days: number;
  strength: number;
  is_subscription?: boolean;
  is_essential?: boolean;
  cancel_candidate?: boolean;
  tag?: string;
};

export type AnalyticsSubscriptionsResponse = {
  mode?: 'recurring' | 'subscriptions';
  month?: string;
  window_months?: number;
  subscriptions?: SubscriptionItem[];
  other_recurring?: SubscriptionItem[];
  cancel_candidates?: SubscriptionItem[];
  llm_prompt?: string;  // Backend provides the structured prompt template
  // Legacy format support
  items?: SubscriptionItem[];
};

// ============================================================================
// Formatters for Tool Results
// ============================================================================

export function formatSubscriptionsReply(res: AnalyticsSubscriptionsResponse): string {
  // The backend provides llm_prompt with detailed instructions for the LLM.
  // We build a concise JSON summary of the data and let the LLM format it
  // according to the prompt template.

  const mode = res.mode || 'subscriptions';
  const month = res.month || 'current month';
  const windowMonths = res.window_months || 6;

  // Build a JSON summary for the LLM to process
  const data: Record<string, any> = {
    mode,
    month,
    window_months: windowMonths,
  };

  if (mode === 'recurring') {
    data.subscriptions = (res.subscriptions || []).map(item => ({
      merchant: item.merchant,
      avg_amount: item.avg_amount,
      count: item.count,
      median_gap_days: item.median_gap_days,
      strength: item.strength,
      is_subscription: true,
    }));

    data.other_recurring = (res.other_recurring || []).map(item => ({
      merchant: item.merchant,
      avg_amount: item.avg_amount,
      count: item.count,
      median_gap_days: item.median_gap_days,
      strength: item.strength,
      is_subscription: false,
    }));
  } else {
    // Subscriptions mode
    data.subscriptions = (res.subscriptions || res.items || []).map(item => ({
      merchant: item.merchant,
      avg_amount: item.avg_amount,
      count: item.count,
      median_gap_days: item.median_gap_days,
      strength: item.strength,
      is_subscription: true,
      is_essential: item.is_essential || false,
      cancel_candidate: item.cancel_candidate || false,
    }));

    data.cancel_candidates = (res.cancel_candidates || []).map(item => ({
      merchant: item.merchant,
      avg_amount: item.avg_amount,
      count: item.count,
      cancel_candidate: true,
    }));
  }

  // If backend provided a prompt template, use it as a system message prefix
  const promptPrefix = res.llm_prompt
    ? `${res.llm_prompt}\n\nHere is the data:\n`
    : `Analyze the following ${mode} data for ${month}:\n`;

  return promptPrefix + JSON.stringify(data, null, 2);
}

// ============================================================================
// Main Tool Runner
// ============================================================================

export async function runToolWithRephrase<T>(
  tool: string,
  fetcher: () => Promise<T>,
  promptBuilder: (data: T) => string,
  appendAssistant: (msg: string, meta?: any) => void,
  setThinking: (on: boolean) => void,
  buildRephraseMeta?: () => Record<string, any>
) {
  console.debug(`[tools] ${tool} → fetch`);
  setThinking(true);
  try {
    // No text placeholder; rely on UI spinner via setThinking(true)

    const data = await fetcher();
    let prompt = "";
    try {
      prompt = promptBuilder(data);
    } catch (e: any) {
      console.error(`[tools] ${tool} promptBuilder failed`, e);
      prompt = `Explain briefly why there is no data or an error for ${tool}: ${e?.message ?? e}`;
    }

    console.debug(`[tools] ${tool} → rephrase`, { prompt: (prompt || '').slice(0, 160) });
    const extra = (typeof buildRephraseMeta === 'function' ? (buildRephraseMeta() || {}) : {});

    // Try to rephrase via LLM, but fall back to raw prompt if it fails
    let finalReply = prompt;
    let model: string | undefined;
    try {
      const llm = await agentRephrase(prompt);
      finalReply = llm.reply ?? prompt;
      model = llm.model;
      console.debug(`[tools] ${tool} ← rephrase ok`, { model });
    } catch (rephraseErr: any) {
      console.warn(`[tools] ${tool} rephrase failed, using raw prompt`, rephraseErr);
      // Don't throw - just use the raw prompt as fallback
    }

    // Surface mode/args/tool to the UI so ModeChip can render
    appendAssistant(finalReply, { model, grounded: true, tool, mode: tool, ...extra });
  } catch (e: any) {
    console.error(`[tools] ${tool} failed`, e);
    appendAssistant(`Sorry, ${tool} failed: ${e?.message ?? e}`, { severity: "error", tool });
  } finally {
    setThinking(false);
  }
}
