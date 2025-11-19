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
};

export type AnalyticsSubscriptionsResponse = {
  items: SubscriptionItem[];
};

// ============================================================================
// Formatters for Tool Results
// ============================================================================

function humanCadence(days: number): string {
  if (!isFinite(days) || days <= 0) return 'irregular timing';

  if (Math.abs(days - 0.5) < 0.25) return 'multiple times per day';
  if (Math.abs(days - 1) < 0.5) return 'about once a day';
  if (Math.abs(days - 7) < 1.5) return 'about once a week';
  if (Math.abs(days - 14) < 2) return 'about every two weeks';
  if (Math.abs(days - 30) < 3) return 'about once a month';

  return `every ~${days.toFixed(1)} days`;
}

export function formatSubscriptionsReply(res: AnalyticsSubscriptionsResponse): string {
  const items = res.items ?? [];

  if (!items.length) {
    return "I didn't find any clear recurring subscriptions in your recent transactions.";
  }

  const lines: string[] = [];
  lines.push("Here are some merchants that look like recurring subscriptions:\n");

  for (const item of items.slice(0, 8)) {
    const cadence = humanCadence(item.median_gap_days);
    // strength is 0–1; show as % with 0 decimals
    const strengthPct = Math.round(item.strength * 100);

    lines.push(
      `• **${item.merchant}** — ` +
      `${item.count} charges, avg $${item.avg_amount.toFixed(2)}, ${cadence} ` +
      `(recurring score ~${strengthPct}%).`
    );
  }

  lines.push(
    "\n💡 The recurring score is between 0–100%. Higher means it looks more like a stable subscription pattern."
  );

  return lines.join("\n");
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
