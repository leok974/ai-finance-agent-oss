// --- src/components/ChatDock.tsx ---
import React from "react";
import { agentTools } from "../lib/api";
import type { ToolKey, ToolSpec, ToolRunState } from "../types/agentTools";
import { AgentResultRenderer } from "./AgentResultRenderers";
import { useMonth } from "../context/MonthContext";

const TOOLS: ToolSpec[] = [
  {
    key: "transactions.search",
    label: "Transactions: Search",
    path: "/agent/tools/transactions/search",
    examplePayload: { month: undefined, limit: 20, filters: { labeled: false } },
  },
  {
    key: "transactions.categorize",
    label: "Transactions: Categorize",
    path: "/agent/tools/transactions/categorize",
    examplePayload: { updates: [{ id: 1, category: "Groceries" }], onlyIfUnlabeled: true },
  },
  {
    key: "transactions.get_by_ids",
    label: "Transactions: Get by IDs",
    path: "/agent/tools/transactions/get_by_ids",
    examplePayload: { ids: [1, 2, 3] },
  },
  {
    key: "budget.summary",
    label: "Budget: Summary",
    path: "/agent/tools/budget/summary",
    examplePayload: { month: undefined },
  },
  {
    key: "budget.check",
    label: "Budget: Check",
    path: "/agent/tools/budget/check",
    examplePayload: { month: undefined },
  },
  {
    key: "insights.summary",
    label: "Insights: Summary",
    path: "/agent/tools/insights/summary",
    examplePayload: { month: undefined, limitLargeTxns: 10, includeUnknownSpend: true },
  },
  {
  key: "insights.expanded",
  label: "Insights: Expanded (MoM + anomalies)",
    path: "/agent/tools/insights/expanded",
    examplePayload: { month: undefined, large_limit: 10 },
  },
  {
    key: "charts.summary",
    label: "Charts: Summary",
    path: "/agent/tools/charts/summary",
    examplePayload: { month: undefined },
  },
  {
    key: "charts.merchants",
    label: "Charts: Top Merchants",
    path: "/agent/tools/charts/merchants",
    examplePayload: { month: undefined, limit: 10 },
  },
  {
    key: "charts.flows",
    label: "Charts: Flows",
    path: "/agent/tools/charts/flows",
    examplePayload: { month: undefined },
  },
  {
    key: "charts.trends",
    label: "Charts: Spending Trends",
    path: "/agent/tools/charts/spending_trends",
    examplePayload: { month: undefined, monthsBack: 6 },
  },
  {
    key: "rules.test",
    label: "Rules: Test",
    path: "/agent/tools/rules/test",
    examplePayload: { month: undefined, rule: { merchant: "Starbucks", category: "Dining out" } },
  },
  {
    key: "rules.apply",
    label: "Rules: Apply (unlabeled only)",
    path: "/agent/tools/rules/apply",
    examplePayload: { month: undefined, onlyUnlabeled: true, rule: { merchant: "Starbucks", category: "Dining out" } },
  },
];

function spinner() {
  return (
    <div className="animate-spin h-5 w-5 rounded-full border-2 border-gray-400 border-t-transparent" aria-label="loading" />
  );
}

export default function ChatDock() {
  const { month } = useMonth();
  const [tool, setTool] = React.useState<ToolKey>("insights.summary");
  const spec = React.useMemo(() => TOOLS.find(t => t.key === tool)!, [tool]);

  // Store payloads keyed by tool so switching tools preserves edits
  const [payloads, setPayloads] = React.useState<Record<string, string>>({});
  const [payloadText, setPayloadText] = React.useState<string>("");
  React.useEffect(() => {
    const existing = payloads[tool];
    setPayloadText(existing ?? JSON.stringify(spec.examplePayload, null, 2));
  }, [tool, spec, payloads]);

  const [state, setState] = React.useState<ToolRunState>({ loading: false, error: null, data: null });

  // Use global month from MonthContext; fallback lets backend choose latest
  const inferMonth = React.useCallback(() => month, [month]);

  const insertContext = React.useCallback(() => {
    try {
      const obj = payloadText.trim() ? JSON.parse(payloadText) : {};
      if (obj.month === undefined) obj.month = inferMonth();
    const next = JSON.stringify(obj, null, 2);
    setPayloadText(next);
    setPayloads((p) => ({ ...p, [tool]: next }));
    } catch {
      // ignore if invalid JSON; keep user text
    }
  }, [payloadText, inferMonth, tool]);

  const run = React.useCallback(async () => {
    let body: any;
    try {
      body = payloadText.trim() ? JSON.parse(payloadText) : {};
    } catch (e: any) {
      setState({ loading: false, error: "Invalid JSON payload.", data: null });
      return;
    }

    setState({ loading: true, error: null, data: null });
    try {
      let data: unknown;

      switch (tool) {
        case "transactions.search":
          data = await agentTools.searchTransactions(body);
          break;
        case "transactions.categorize":
          data = await agentTools.categorizeTransactions(body);
          break;
        case "transactions.get_by_ids":
          data = await agentTools.getTransactionsByIds(body);
          break;
        case "budget.summary":
          data = await agentTools.budgetSummary(body);
          break;
        case "budget.check":
          data = await agentTools.budgetCheck(body);
          break;
        case "insights.summary":
          data = await agentTools.insightsSummary(body);
          break;
        case "insights.expanded":
          data = await agentTools.insightsExpanded(body);
          break;
        case "charts.summary":
          data = await agentTools.chartsSummary(body);
          break;
        case "charts.merchants":
          data = await agentTools.chartsMerchants(body);
          break;
        case "charts.flows":
          data = await agentTools.chartsFlows(body);
          break;
        case "charts.trends":
          data = await agentTools.chartsSpendingTrends(body);
          break;
        case "rules.test":
          data = await agentTools.rulesTest(body);
          break;
        case "rules.apply":
          data = await agentTools.rulesApply(body);
          break;
        default:
          throw new Error("Unknown tool.");
      }

      setState({ loading: false, error: null, data });
    } catch (e: any) {
      setState({ loading: false, error: e?.message ?? "Request failed", data: null });
    }
  }, [tool, payloadText]);

  return (
    <div className="fixed bottom-6 left-6 z-50 w-[min(720px,calc(100vw-2rem))]">
      <div className="rounded-2xl shadow-xl bg-white/90 backdrop-blur p-4 border border-gray-200">
        <div className="flex items-center gap-3">
          <select
            className="px-3 py-2 rounded-xl border border-gray-300 bg-white"
            value={tool}
            onChange={(e) => setTool(e.target.value as ToolKey)}
          >
            {TOOLS.map(t => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>

          <button
            className="px-3 py-2 rounded-xl border bg-gray-50 hover:bg-gray-100"
            onClick={insertContext}
            title="Insert default context (month, safe defaults)"
          >
            Insert context
          </button>

          <button
            className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            onClick={run}
            disabled={state.loading}
          >
            {state.loading ? (<>{spinner()} Running…</>) : "Run"}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Payload (JSON)</label>
            <textarea
              className="mt-1 w-full h-44 rounded-xl border border-gray-300 p-3 font-mono text-sm"
              spellCheck={false}
              value={payloadText}
              onChange={(e) => {
                const val = e.target.value;
                setPayloadText(val);
                setPayloads((p) => ({ ...p, [tool]: val }));
              }}
              placeholder='{}'
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Tip: Leave <code>month</code> empty to let the backend default to the latest month.
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500">Result</label>
            <div className="mt-1 h-44 md:h-auto max-h-96 overflow-auto rounded-xl border border-gray-300 p-3 bg-gray-50">
              {state.error ? (
                <div className="text-red-600 text-sm whitespace-pre-wrap">{state.error}</div>
              ) : state.loading ? (
                <div className="flex items-center gap-2 text-gray-600">
                  <div className="animate-spin h-5 w-5 rounded-full border-2 border-gray-400 border-t-transparent" />
                  <span>Loading…</span>
                </div>
              ) : state.data ? (
                <AgentResultRenderer tool={tool} data={state.data as any} />
              ) : (
                <div className="text-gray-500 text-sm">No result yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 text-[11px] text-gray-500">
          Endpoints are POST-only and return agent-friendly JSON. Payload must be valid JSON.
        </div>
      </div>
    </div>
  );
}
