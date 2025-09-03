import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  agentStatusOk,
  agentChat,
  getBudgetCheck,
  getInsights,
  getAlerts,
  getMonthSummary,
  getMonthMerchants,
} from "../lib/api";

type Msg = { role: "user" | "assistant" | "system"; content: string };

interface ChatDockProps { month?: string }

const ChatDock: React.FC<ChatDockProps> = ({ month }) => {
  const [open, setOpen] = useState<boolean>(() => (localStorage.getItem("chatdock_open") ?? "1") === "1");
  const [ready, setReady] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolBusy, setToolBusy] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem("chatdock_open", open ? "1" : "0");
  }, [open]);

  useEffect(() => { (async () => setReady(await agentStatusOk()))(); }, []);

  useEffect(() => {
    // autoscroll
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs, open]);

  const send = useCallback(async (finalInput?: string) => {
    const text = (finalInput ?? input).trim();
    if (!text || busy) return;
    if (!finalInput) setInput("");
    const nextMsgs = [...msgs, { role: "user" as const, content: text }];
    setMsgs(nextMsgs);
    setBusy(true);
    try {
      const apiMsgs = nextMsgs.map((m) => ({ role: m.role, content: m.content }));
      const r = await agentChat(apiMsgs, { system: "You are Finance Agent OSS. Be concise and helpful." });
      const reply = r?.reply ?? r?.content ?? (typeof r === "string" ? r : JSON.stringify(r));
      setMsgs((xs) => [...xs, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setMsgs((xs) => [...xs, { role: "system", content: `⚠️ Chat failed: ${e?.message ?? e}` }]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, msgs]);

  // ---- Quick Tools: fetch data, add as system context, then ask model ----
  const runToolAndAsk = useCallback(
    async (label: string, fetcher: () => Promise<any>, userQuestion: string) => {
      if (toolBusy) return;
      setToolBusy(label);
      try {
        const data = await fetcher();
        const payload = JSON.stringify(data).slice(0, 4000);
        const toolContext = { role: "system" as const, content: `[tool:${label}] ${payload}` };
        const nextMsgs = [...msgs, toolContext, { role: "user" as const, content: userQuestion }];
        setMsgs(nextMsgs);
        const r = await agentChat(nextMsgs, { system: "You are Finance Agent OSS. Use provided tool context if relevant." });
        const reply = r?.reply ?? r?.content ?? (typeof r === "string" ? r : JSON.stringify(r));
        setMsgs((xs) => [...xs, { role: "assistant", content: reply }]);
      } catch (e: any) {
        setMsgs((xs) => [...xs, { role: "system", content: `⚠️ ${label} failed: ${e?.message ?? e}` }]);
      } finally {
        setToolBusy(null);
      }
    },
    [msgs, toolBusy]
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 left-4 z-[70] rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-indigo-500"
      >
        {open ? "Close Chat" : "Finance Chat"}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-20 left-4 z-[70] w-[360px] max-w-[92vw] rounded-2xl border border-gray-700 bg-gray-900/90 backdrop-blur shadow-2xl">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="text-sm font-semibold text-gray-100">Finance Chat</div>
            <div className={`text-xs ${ready ? "text-emerald-300" : "text-gray-400"}`}>
              {ready ? "online" : "offline"}
            </div>
          </div>
          {/* Quick Tools */}
          <div className="flex flex-wrap gap-2 px-3 pb-2">
            <button
              onClick={() =>
                runToolAndAsk(
                  "month_summary",
                  () => getMonthSummary(month),
                  month ? `Summarize my finances for ${month} (spend, income, net, notable categories).` : `Summarize my latest month finances (spend, income, net, notable categories).`
                )
              }
              className="rounded-full border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              disabled={!!toolBusy || !ready}
              title="Fetch totals + categories"
            >
              {toolBusy === "month_summary" ? "…" : "Summary"}
            </button>

            <button
              onClick={() =>
                runToolAndAsk(
                  "top_merchants",
                  () => getMonthMerchants(month),
                  month ? `Which merchants dominated spending in ${month}? Any outliers?` : `Which merchants dominated spending in the latest month? Any outliers?`
                )
              }
              className="rounded-full border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              disabled={!!toolBusy || !ready}
              title="Fetch top merchants"
            >
              {toolBusy === "top_merchants" ? "…" : "Top merchants"}
            </button>

            <button
              onClick={() =>
                runToolAndAsk(
                  "budget_check",
                  () => getBudgetCheck(month),
                  month ? `Where am I over/under budget in ${month}? Give brief guidance.` : `Where am I over/under budget for the latest month? Give brief guidance.`
                )
              }
              className="rounded-full border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              disabled={!!toolBusy || !ready}
              title="Fetch budget status"
            >
              {toolBusy === "budget_check" ? "…" : "Budgets"}
            </button>

            <button
              onClick={() =>
                runToolAndAsk(
                  "alerts",
                  () => getAlerts(),
                  `Review current alerts and tell me what I should act on first.`
                )
              }
              className="rounded-full border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              disabled={!!toolBusy || !ready}
              title="Fetch alerts"
            >
              {toolBusy === "alerts" ? "…" : "Alerts"}
            </button>

            <button
              onClick={() =>
                runToolAndAsk(
                  "insights",
                  () => getInsights(),
                  `Turn these insights into 2–3 bullet takeaways and one suggestion.`
                )
              }
              className="rounded-full border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              disabled={!!toolBusy || !ready}
              title="Fetch insights"
            >
              {toolBusy === "insights" ? "…" : "Insights"}
            </button>

            <button
              onClick={() =>
                runToolAndAsk(
                  "context_month_hint",
                  async () => (month ? { month } : {}), // light-weight context when available
                  month ? `Find large transactions in ${month} over $500. Return a short list with date, merchant, and amount.` : `Find large transactions over $500 in the latest month. Return a short list with date, merchant, and amount.`
                )
              }
              className="rounded-full border border-gray-700 px-2 py-1 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              disabled={!!toolBusy || !ready}
              title="Find > $500 txns this month"
            >
              {toolBusy === "context_month_hint" ? "…" : "Large txns > $500"}
            </button>
          </div>

          {/* Transcript */}
          <div ref={scrollRef} className="mx-3 h-64 overflow-auto rounded-xl bg-black/20 p-2 text-sm">
            {msgs.length === 0 && (
              <div className="text-gray-400">
                Ask about months, categories, anomalies… or tap a quick tool above.
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className="mb-2">
                <span
                  className={`mr-2 rounded px-1.5 py-0.5 text-[11px] ${
                    m.role === "user"
                      ? "bg-indigo-600/70 text-white"
                      : m.role === "assistant"
                      ? "bg-emerald-600/70 text-white"
                      : "bg-gray-600/70 text-gray-100"
                  }`}
                >
                  {m.role}
                </span>
                <span className="whitespace-pre-wrap text-gray-100">{m.content}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={ready ? "Type your question…" : "Agent offline…"}
              disabled={!ready || busy}
              className="flex-1 rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={() => send()}
              disabled={!ready || busy || !input.trim()}
              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                !ready || busy || !input.trim()
                  ? "cursor-not-allowed bg-gray-800 text-gray-500"
                  : "bg-indigo-600 text-white hover:bg-indigo-500"
              }`}
            >
              {busy ? "…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatDock;
