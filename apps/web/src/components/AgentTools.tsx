import { focusComposer, getComposerValue, SEARCH_PLACEHOLDER, setComposerPlaceholder } from "@/state/chat/ui";
import { pushAssistant, callTool } from "@/state/chat";
import type { ChipAction } from "@/components/QuickChips";

export const EXAMPLES: { label: string; action: ChipAction }[] = [
  { label: "Starbucks this month", action: { type: "nl_search", query: "Starbucks this month", presetText: "Starbucks this month" } },
  { label: "Delta in Aug 2025", action: { type: "nl_search", query: "Delta in Aug 2025", presetText: "Delta in Aug 2025" } },
  { label: "Transactions > $50 last 90 days", action: { type: "nl_search", query: "transactions > $50 last 90 days", presetText: "Transactions > $50 last 90 days" } },
  { label: "Refunds last month", action: { type: "nl_search", query: "refunds last month", presetText: "Refunds last month" } },
];

type TransactionsPayload = { query?: string; filters?: any; presetText?: string };

let lastTransactionsPayload: TransactionsPayload | null = null;

export async function handleTransactionsNL(payload?: TransactionsPayload) {
  const raw = payload?.query ?? getComposerValue();
  const q = (raw || "").trim();

  if (!q && !payload?.filters) {
    pushAssistant({
      reply:
        "Type what to search, e.g., ‘Starbucks this month’, ‘Delta in Aug 2025’, ‘transactions > $50 last 90 days’.",
      rephrased: false,
      suggestions: EXAMPLES,
      meta: { tool: "transactions.nl", reason: "empty" },
    });
    setComposerPlaceholder(SEARCH_PLACEHOLDER);
    focusComposer();
    return;
  }

  const nextPayload: TransactionsPayload = payload?.filters
    ? { filters: payload.filters, presetText: payload.presetText }
    : { query: q, presetText: payload?.presetText };

  lastTransactionsPayload = nextPayload;
  await callTool("transactions.nl", nextPayload);
}

if (typeof window !== "undefined") {
  const key = "__transactionsNlChipListener__" as const;
  const win = window as typeof window & { [key]?: boolean };
  if (!win[key]) {
    win[key] = true;
    window.addEventListener(
      "chip-action",
      (e: Event) => {
        const evt = e as CustomEvent<ChipAction>;
        const action = evt.detail;
        if (!action) return;
        if (action.type === "nl_search") {
          void handleTransactionsNL({ query: action.query, presetText: action.presetText });
        } else if (action.type === "nl_search_filters") {
          void handleTransactionsNL({ filters: action.filters, presetText: action.presetText });
        } else if (action.type === "toggle" && action.key === "insightsExpanded") {
          document.querySelector<HTMLButtonElement>("#toggle-insights-expanded")?.click();
          if (lastTransactionsPayload) {
            void handleTransactionsNL(lastTransactionsPayload);
          }
        } else if (action.type === "nav") {
          window.location.href = action.href;
        }
      },
      false
    );
  }
}
