import React, { useEffect, useRef } from "react";
import { agentTools, agentChat, getAgentModels, type AgentChatRequest, type AgentChatResponse, type AgentModelsResponse } from "../lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ToolKey, ToolSpec, ToolRunState } from "../types/agentTools";
import { AgentResultRenderer } from "./AgentResultRenderers";
import ErrorBoundary from "./ErrorBoundary";
import { useMonth } from "../context/MonthContext";

const TOOL_GROUPS: Array<{ label: string; items: ToolSpec[] }> = [
  {
    label: "Insights",
    items: [
      { key: "insights.expanded", label: "Insights: Expanded (MoM + anomalies)", path: "/agent/tools/insights/expanded", examplePayload: { month: undefined, large_limit: 10 } },
    ],
  },
  {
    label: "Transactions",
    items: [
      { key: "transactions.search", label: "Transactions: Search", path: "/agent/tools/transactions/search", examplePayload: { month: undefined, limit: 20, filters: { labeled: false } } },
      { key: "transactions.categorize", label: "Transactions: Categorize", path: "/agent/tools/transactions/categorize", examplePayload: { updates: [{ id: 1, category: "Groceries" }], onlyIfUnlabeled: true } },
      { key: "transactions.get_by_ids", label: "Transactions: Get by IDs", path: "/agent/tools/transactions/get_by_ids", examplePayload: { ids: [1,2,3] } },
    ],
  },
  {
    label: "Budget",
    items: [
      { key: "budget.summary", label: "Budget: Summary", path: "/agent/tools/budget/summary", examplePayload: { month: undefined } },
      { key: "budget.check",   label: "Budget: Check",   path: "/agent/tools/budget/check",   examplePayload: { month: undefined } },
    ],
  },
  {
    label: "Charts",
    items: [
      { key: "charts.summary",   label: "Charts: Summary",         path: "/agent/tools/charts/summary",          examplePayload: { month: undefined } },
      { key: "charts.merchants", label: "Charts: Top Merchants",   path: "/agent/tools/charts/merchants",        examplePayload: { month: undefined, limit: 10 } },
      { key: "charts.flows",     label: "Charts: Flows",           path: "/agent/tools/charts/flows",            examplePayload: { month: undefined } },
  { key: "charts.trends",    label: "Charts: Spending Trends", path: "/agent/tools/charts/spending_trends",  examplePayload: { month: undefined, months_back: 6 } },
    ],
  },
  {
    label: "Rules",
    items: [
      { key: "rules.test",     label: "Rules: Test",      path: "/agent/tools/rules/test",      examplePayload: { month: undefined, rule: { merchant: "Starbucks", category: "Dining out" } } },
      { key: "rules.apply",    label: "Rules: Apply",     path: "/agent/tools/rules/apply",     examplePayload: { month: undefined, onlyUnlabeled: true, rule: { merchant: "Starbucks", category: "Dining out" } } },
      { key: "rules.apply_all",label: "Rules: Apply All", path: "/agent/tools/rules/apply_all", examplePayload: { month: undefined } },
    ],
  },
];

const TOOLS = TOOL_GROUPS.flatMap(g => g.items);
const findSpec = (k: ToolKey) => TOOLS.find(t => t.key === k)!;

function Spinner() {
  return <div className="animate-spin h-4 w-4 rounded-full border-2 border-gray-400 border-t-transparent" aria-label="loading" />;
}

export default function ChatDock() {
  const { month } = useMonth();
  const [open, setOpen] = React.useState<boolean>(false);
  const [pos, setPos] = React.useState<{x:number;y:number}>(() => {
    const raw = localStorage.getItem("chatdock_pos");
    return raw ? JSON.parse(raw) : { x: 24, y: 24 };
  });

  const [tool, setTool] = React.useState<ToolKey>("insights.expanded");
  const spec = React.useMemo(() => findSpec(tool), [tool]);

  const [payloads, setPayloads] = React.useState<Record<string, string>>({});
  const [payloadText, setPayloadText] = React.useState<string>(() => JSON.stringify(spec.examplePayload, null, 2));
  const [state, setState] = React.useState<ToolRunState>({ loading: false, error: null, data: null });
  const [lastRunForTool, setLastRunForTool] = React.useState<Record<string, string | undefined>>({});
  const runningRef = React.useRef<AbortController | null>(null);
  const lastClickAtRef = React.useRef<number>(0);
  const [monthReady, setMonthReady] = React.useState<boolean>(false);
  // unified chat state
  const [modelsInfo, setModelsInfo] = React.useState<AgentModelsResponse | null>(null);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [selectedModel, setSelectedModel] = React.useState<string>(""); // empty => server default
  const [busy, setBusy] = React.useState(false);
  const [chatResp, setChatResp] = React.useState<AgentChatResponse | null>(null);
  
  // Auto-run state for debounced month changes
  const isAutoRunning = useRef(false);
  const debounceTimer = useRef<number | null>(null);

  // stop saving/restoring "open"; clean any legacy value once
  React.useEffect(() => { localStorage.removeItem("chatdock_open"); }, []);
  React.useEffect(() => { localStorage.setItem("chatdock_pos", JSON.stringify(pos)); }, [pos]);
  // fetch models (best-effort)
  React.useEffect(() => { (async () => {
    try { const info = await getAgentModels(); setModelsInfo(info || null); } catch { /* ignore */ }
  })(); }, []);

  // handle keyboard
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
      if (e.key.toLowerCase() === "k" && e.shiftKey && e.ctrlKey) { e.preventDefault(); setOpen(v => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // switch tool keeps per-tool payload
  React.useEffect(() => {
    const existing = payloads[tool];
    setPayloadText(existing ?? JSON.stringify(spec.examplePayload, null, 2));
  }, [tool, spec, payloads]);

  // mark month ready once a non-empty month is available
  React.useEffect(() => { if (month) setMonthReady(true); }, [month]);

  // helper: force-set month into payload text
  const setMonthInPayload = React.useCallback((m: string | undefined) => {
    try {
      const obj = payloadText.trim() ? JSON.parse(payloadText) : {};
      obj.month = m;
      const newText = JSON.stringify(obj, null, 2);
      setPayloadText(newText);
      setPayloads(p => ({ ...p, [tool]: newText }));
    } catch { /* ignore bad json */ }
  }, [payloadText, tool]);

  // simplify insert: always overwrite month with current context
  const insertContext = React.useCallback(() => {
    setMonthInPayload(month);
  }, [month, setMonthInPayload]);

  // ensure month exists for tools that require it
  const ensureMonth = (b: any) => {
    if (b == null || typeof b !== "object") return b;
    if (b.month === undefined || b.month === null || b.month === "") {
      b.month = month;
    }
    return b;
  };

  const run = React.useCallback(async () => {
    // simple cooldown (prevents quick double-click flicker)
    const now = Date.now();
  if (now - lastClickAtRef.current < 300) return;
    lastClickAtRef.current = now;

    // prevent overlap
    if (runningRef.current) return;

    // parse a FRESH body (never mutate previous object)
    let body: any = {};
    try {
      body = payloadText.trim() ? JSON.parse(payloadText) : {};
    } catch {
      setState({ loading:false, error:"Invalid JSON payload.", data:null });
      return;
    }

    // inject/snap month for month-required tools
    const monthRequired = new Set<ToolKey>([
      "transactions.search",
      "insights.expanded",
      "charts.summary",
      "charts.merchants",
      "charts.flows",
      "charts.trends",
    ]);

    if (monthRequired.has(tool)) {
      if (!body.month || body.month !== month) {
        body = { ...body, month }; // snap to current MonthContext
        const newText = JSON.stringify(body, null, 2);
        setPayloadText(newText);
        setPayloads(p => ({ ...p, [tool]: newText }));
      }
    }

    // single-flight
    const ctrl = new AbortController();
    runningRef.current = ctrl;
    setState({ loading: true, error: null, data: null });

    try {
      let data: unknown;
      switch (tool) {
        case "transactions.search":       data = await agentTools.searchTransactions(body, ctrl.signal); break;
        case "transactions.categorize":   data = await agentTools.categorizeTransactions(body, ctrl.signal); break;
        case "transactions.get_by_ids":   data = await agentTools.getTransactionsByIds(body, ctrl.signal); break;
        case "budget.summary":            data = await agentTools.budgetSummary(body, ctrl.signal); break;
        case "budget.check":              data = await agentTools.budgetCheck(body, ctrl.signal); break;
        case "insights.expanded":         data = await agentTools.insightsExpanded(body, ctrl.signal); break;
        case "charts.summary":            data = await agentTools.chartsSummary(body, ctrl.signal); break;
        case "charts.merchants":          data = await agentTools.chartsMerchants(body, ctrl.signal); break;
        case "charts.flows":              data = await agentTools.chartsFlows(body, ctrl.signal); break;
        case "charts.trends":             data = await agentTools.chartsSpendingTrends(body, ctrl.signal); break;
        case "rules.test":                data = await agentTools.rulesTest(body, ctrl.signal); break;
        case "rules.apply":               data = await agentTools.rulesApply(body, ctrl.signal); break;
        case "rules.apply_all":           data = await agentTools.rulesApplyAll(body, ctrl.signal); break;
        default: throw new Error("Unknown tool");
      }
      setState({ loading: false, error: null, data });
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setState({ loading: false, error: e?.message ?? "Request failed", data: null });
      }
    } finally {
      runningRef.current = null;
    }
  }, [tool, payloadText, month]);

  // Lightweight tool palette → uses unified /agent/chat
  const appendAssistant = React.useCallback((resp: AgentChatResponse) => {
    setChatResp(resp);
  }, []);

  const quickTools: Array<{ key: string; label: string; run: () => Promise<void> }> = React.useMemo(() => ([
    {
      key: 'month_summary',
      label: 'Month summary',
      run: async () => {
        setBusy(true);
        try {
          const req: AgentChatRequest = {
            messages: [{ role: 'user', content: 'Summarize my spending this month in 4 bullets and one action.' }],
            intent: 'general',
            ...(selectedModel ? { model: selectedModel } : {})
          };
          const resp = await agentChat(req);
          appendAssistant(resp);
        } finally { setBusy(false); }
      }
    },
    {
      key: 'find_subs',
      label: 'Find subscriptions',
      run: async () => {
        setBusy(true);
        try {
          const req: AgentChatRequest = {
            messages: [{ role: 'user', content: 'Identify recurring subscriptions this month and suggest which I could cancel.' }],
            intent: 'general',
            ...(selectedModel ? { model: selectedModel } : {})
          };
          const resp = await agentChat(req);
          appendAssistant(resp);
        } finally { setBusy(false); }
      }
    }
  ]), [appendAssistant, selectedModel]);

  // Auto-run on month change with debouncing and in-flight protection
  useEffect(() => {
    if (!month || !monthReady) return;

    // Debounce 300ms to avoid double-run from rapid state updates
    if (debounceTimer.current) {
      window.clearTimeout(debounceTimer.current);
    }
    
    debounceTimer.current = window.setTimeout(async () => {
      if (isAutoRunning.current) return;
      if (runningRef.current) return; // Already running from manual click
      if (lastRunForTool[tool] === month) return; // Already ran for this month/tool combo
      
      try {
        isAutoRunning.current = true;
        insertContext(); // Update payload with current month
        await run(); // Run the tool
        setLastRunForTool(prev => ({ ...prev, [tool]: month }));
      } catch (e) {
        console.error("Auto insertContext/run failed:", e);
      } finally {
        isAutoRunning.current = false;
      }
    }, 300);

    return () => {
      if (debounceTimer.current) {
        window.clearTimeout(debounceTimer.current);
      }
    };
  }, [month, monthReady, tool, insertContext, run, lastRunForTool]); // runs every time month changes

  // unified FAB click-or-drag handler (opens on click, drags on movement)
  const startFabDrag = React.useCallback((e: React.PointerEvent) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...pos };
    let moved = false;

    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (moved) {
        setPos({
          x: Math.max(8, startPos.x - dx), // using right/bottom anchors
          y: Math.max(8, startPos.y - dy),
        });
      }
    };

    const onUp = (_ev: PointerEvent) => {
      el.releasePointerCapture?.(e.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved) setOpen(true);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [pos, setPos, setOpen]);

  // header drag handler (drag only, no click-to-open)
  const startHeaderDrag = React.useCallback((e: React.PointerEvent) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...pos };
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setPos({ x: Math.max(8, startPos.x - dx), y: Math.max(8, startPos.y - dy) });
    };
    const onUp = () => {
      el.releasePointerCapture?.(e.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [pos]);

  // collapsed bubble (FAB)
  if (!open) {
    return (
      <div
        className="fixed z-[70] rounded-full shadow-lg bg-black text-white w-12 h-12 flex items-center justify-center hover:opacity-90 select-none"
        style={{ right: pos.x, bottom: pos.y, cursor: "grab" }}
        // one element handles both drag & click (click = no movement)
        onPointerDown={startFabDrag}
        title="Open Agent Tools (Ctrl+Shift+K)"
      >
        💬
      </div>
    );
  }

  return (
    <div
      className="fixed z-[70] w-[min(760px,calc(100vw-2rem))] max-h-[80vh] rounded-2xl border border-neutral-700 shadow-xl bg-neutral-900/95 backdrop-blur p-4"
      style={{ right: pos.x, bottom: pos.y }}
    >
      <div
        className="flex items-center gap-2 mb-2 select-none"
        style={{ cursor: "grab" }}
        onPointerDown={startHeaderDrag}
      >
        <div className="text-sm text-neutral-300">Agent Tools</div>
        <div className="ml-auto flex items-center gap-2">
          {modelsInfo ? (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setShowAdvanced(v=>!v); }}
              className="px-2 py-1 rounded-lg bg-neutral-800 text-neutral-200 border border-neutral-700 hover:bg-neutral-700"
              title="Advanced (models)"
            >
              {showAdvanced ? 'Hide advanced' : 'Advanced'}
            </button>
          ) : null}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
            className="px-2 py-1 rounded-lg bg-neutral-800 text-neutral-200 border border-neutral-700 hover:bg-neutral-700"
            title="Collapse (Esc)"
          >
            Collapse
          </button>
        </div>
      </div>

      {showAdvanced && modelsInfo && (
        <div className="mb-2 p-2 rounded-lg border border-neutral-800 bg-neutral-800/40">
          <div className="text-xs opacity-70 mb-1">
            Provider: {modelsInfo.provider} · Default: {modelsInfo.default}
          </div>
          <div className="flex items-center gap-2">
            <select
              className="px-2 py-1 text-sm rounded-md bg-neutral-800 border border-neutral-700 text-neutral-100"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="">{`Default (${modelsInfo.provider}: ${modelsInfo.default})`}</option>
              {modelsInfo.models?.map(m => (
                <option key={m.id} value={m.id}>{m.id}</option>
              ))}
            </select>
          </div>
          <div className="text-[11px] mt-1 opacity-60">
            Leave blank to use the server default. This selection applies only in this tab.
          </div>
        </div>
      )}

      {/* Unified tool bar (chat-powered quick actions) */}
      <div className="mb-2 px-1 py-1 border border-neutral-800 rounded-lg bg-neutral-900/60 flex gap-2 flex-wrap">
        {quickTools.map(t => (
          <button
            key={t.key}
            disabled={busy}
            onClick={t.run}
            className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
            title={`Run ${t.label}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <select
          className="px-3 py-2 rounded-xl border border-neutral-700 bg-neutral-800 text-neutral-100 w-full"
          value={tool}
          onChange={(e) => setTool(e.target.value as ToolKey)}
        >
          {TOOL_GROUPS.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </optgroup>
          ))}
        </select>

        <button
          className="px-3 py-2 rounded-xl border border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700"
          onClick={insertContext}
          title="Insert default context (uses global month)"
        >
          Insert context
        </button>

        <button
          className="px-4 py-2 rounded-xl bg-white text-black hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          onClick={run}
          disabled={state.loading}
        >
          {state.loading ? (<><Spinner/> Running…</>) : "Run"}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-neutral-400">Payload (JSON)</label>
          <textarea
            className="w-full h-48 rounded-xl border p-3
                       bg-[var(--bg-card)] border-[color:var(--border-subtle)]
                       text-[var(--text)] placeholder:text-[var(--text-muted)]
                       focus:outline-none focus:ring-2 focus:ring-[color:var(--border-subtle)]
                       font-mono text-sm resize-y"
            spellCheck={false}
            value={payloadText}
            onChange={(e) => {
              setPayloadText(e.target.value);
              setPayloads(p => ({ ...p, [tool]: e.target.value }));
            }}
            placeholder="{}"
          />
          <p className="mt-1 text-[11px] text-neutral-500">
            Tip: Leave <code>month</code> empty to use the latest from data.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-neutral-400">Result</label>
          <div className="mt-1 max-h-[50vh] overflow-auto rounded-xl border border-neutral-700 p-3 bg-neutral-800 text-neutral-100 space-y-3">
            {chatResp ? (
              <div className="rounded-md p-2 bg-neutral-900/60">
                <div className="prose prose-invert max-w-none text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {chatResp.reply || ""}
                  </ReactMarkdown>
                </div>
                {chatResp?.citations?.length ? (
                  <div className="mt-2 text-xs opacity-70">
                    Used data: {chatResp.citations.map((c: any) => c.count ? `${c.type} ${c.count}` : `${c.type}`).join(' · ')}
                    {chatResp.used_context?.month ? ` · month ${chatResp.used_context.month}` : ''}
                    {chatResp.model ? ` · ${chatResp.model}` : ''}
                    {chatResp.tool_trace?.length ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer hover:text-neutral-300">Trace</summary>
                        <pre className="whitespace-pre-wrap text-[10px] mt-1 p-2 bg-neutral-900 rounded overflow-auto max-h-32">
                          {JSON.stringify(chatResp.tool_trace, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {state.error ? (
              <div className="text-red-400 text-sm whitespace-pre-wrap">{state.error}</div>
            ) : state.loading ? (
              <div className="flex items-center gap-2 text-neutral-300"><Spinner/> <span>Loading…</span></div>
            ) : (
              <ErrorBoundary fallback={(err) => (
                <div className="text-red-400 text-sm">
                  Renderer error: {String(err)}
                  <pre className="mt-2 text-xs whitespace-pre-wrap">{JSON.stringify(state.data, null, 2)}</pre>
                </div>
              )}>
                {state.data ? (
                  <AgentResultRenderer tool={tool} data={state.data as any} />
                ) : (
                  <div className="text-neutral-400 text-sm">No result yet.</div>
                )}
              </ErrorBoundary>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
