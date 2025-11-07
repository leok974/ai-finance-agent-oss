/**
 * Smart export logic - detects finance replies and builds export payloads
 */

import type { FinanceExport } from "@/types/finance-export";
import type { MonthSummary } from "@/lib/formatters/finance";

type Message = {
  role: string;
  text: string;
  ts: number;
  meta?: {
    mode?: string;
    ctxMonth?: string;
    [key: string]: any;
  };
};

/**
 * Detect if the last assistant message is a finance reply.
 * Returns the finance export payload or null if not a finance message.
 */
export function detectFinanceReply(
  messages: Message[],
  sessionId: string
): FinanceExport | null {
  if (!messages || messages.length === 0) return null;

  // Find the last assistant message
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");

  if (!lastAssistant) return null;

  const mode = lastAssistant.meta?.mode;
  const isFinance =
    mode === "finance_quick_recap" || mode === "finance_deep_dive";

  if (!isFinance) return null;

  // Get the stored MonthSummary data from meta (if available)
  const monthData = lastAssistant.meta?.monthSummary as MonthSummary | undefined;
  const month = lastAssistant.meta?.ctxMonth || "unknown";

  if (!monthData) return null;

  const kind =
    mode === "finance_quick_recap" ? "finance_quick_recap" : "finance_deep_dive";

  const payload: FinanceExport = {
    version: "1.0",
    kind,
    month,
    generated_at: new Date().toISOString(),
    summary: {
      income: monthData.income,
      spend: monthData.spend,
      net: monthData.net,
      top_merchant: monthData.topMerchant
        ? {
            name: monthData.topMerchant.name,
            amount: monthData.topMerchant.amount,
          }
        : undefined,
      unknown: monthData.unknown
        ? {
            amount: monthData.unknown.amount,
            count: monthData.unknown.count,
            top: monthData.unknown.top,
          }
        : undefined,
    },
    source: {
      session_id: sessionId,
      message_id: `${lastAssistant.ts}`, // Use timestamp as message ID
    },
  };

  // Add categories and spikes for deep-dive mode
  if (kind === "finance_deep_dive") {
    payload.categories = monthData.categories;
    payload.spikes = monthData.spikes;
  }

  return payload;
}
