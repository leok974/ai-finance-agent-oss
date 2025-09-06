import React, { useEffect, useRef, useState } from "react";
import { ChevronUp, Wrench } from "lucide-react";
import { agentTools, agentChat, getAgentModels, type AgentChatRequest, type AgentChatResponse, type AgentModelsResponse, type ChatMessage } from "../lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ToolKey, ToolSpec, ToolRunState } from "../types/agentTools";
import { AgentResultRenderer } from "./AgentResultRenderers";
import ErrorBoundary from "./ErrorBoundary";
import { useMonth } from "../context/MonthContext";
import { useChatDock } from "../context/ChatDockContext";
import { exportThreadAsJSON, exportThreadAsMarkdown } from "../utils/chatExport";
import { chatStore } from "../utils/chatStore";

// ---- Chat message types, storage keys, versioning (outside component) ----
type MsgRole = 'user' | 'assistant';
type Msg = { role: MsgRole; text: string; ts: number; meta?: any };

const CHAT_STORAGE_VER = 'v1';
const CHAT_STORE_KEY = `fa.chat.${CHAT_STORAGE_VER}`;
const MODEL_STORE_KEY = 'fa.model';

// sessionStorage-based load/save removed in favor of chatStore (localStorage + BroadcastChannel)

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

// -------------------- Tool presets (tiny tool panel) --------------------
type ToolPresetKey = 'month_summary' | 'find_subs' | 'insights_expanded' | 'cashflow';

const TOOL_PRESETS: Record<ToolPresetKey, { label: string; intent: 'general'|'explain_txn'|'budget_help'|'rule_seed'; prompt: string; defaultPayload?: any }>
 = {
  month_summary: {
    label: 'Month summary',
    intent: 'general',
    prompt: 'Summarize my spending this month in 4 bullets and one next step.',
  },
  find_subs: {
    label: 'Find subscriptions',
    intent: 'general',
    prompt: 'Identify recurring subscriptions this month and suggest which I could cancel, with reasoning.',
  },
  insights_expanded: {
    label: 'Insights: Expanded (MoM + anomalies)',
    intent: 'general',
    prompt: 'Give an expanded month overview with MoM notes and any anomalies. Keep it concise and clear.',
    defaultPayload: { large_limit: 10 },
  },
  cashflow: {
    label: 'Cashflow trend',
    intent: 'general',
    prompt: 'Describe my cashflow trend this month in 3 bullets and one recommendation.',
    defaultPayload: { window: 7 },
  },
};

export default function ChatDock() {
  const { month } = useMonth();
  const chat = useChatDock();
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
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  // NEW: Tiny tools panel state
  const [showTools, setShowTools] = useState<boolean>(true);
  const [activePreset, setActivePreset] = useState<ToolPresetKey>('insights_expanded');
  const [toolPayload, setToolPayload] = useState<string>(() => JSON.stringify(TOOL_PRESETS['insights_expanded'].defaultPayload ?? {}, null, 2));

  // --- feature flags to forcibly hide legacy UI ---
  const ENABLE_TOPBAR_TOOL_BUTTONS = false;   // keep a single “Agent tools” toggle
  const ENABLE_LEGACY_TOOL_FORM    = false;   // hide Payload/Result/Insert context/Run

  // Live message stream (single source of truth) + persistence
  const [messages, setMessages] = useState<Msg[]>([]);
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    chatStore.initCrossTab();
    const unsub = chatStore.subscribe((basic: { role: string; content: string; createdAt: number }[]) => {
      const mapped: Msg[] = (basic || []).map((b: { role: string; content: string; createdAt: number }) => ({ role: (b.role === 'assistant' ? 'assistant' : 'user') as MsgRole, text: String(b.content || ''), ts: Number(b.createdAt) || Date.now() }));
      setMessages(mapped);
      // scroll to bottom after initial hydration
      setTimeout(() => {
        const el = document.querySelector('#chatdock-scroll-anchor') as HTMLElement | null;
        el?.scrollIntoView({ block: 'end' });
      }, 0);
    });
    return () => { try { unsub(); } catch {} };
  }, []);

  // quick sanity ping so you can confirm the file actually recompiled
  useEffect(() => { console.log("[ChatDock] v0906a loaded"); }, []);

  // --- helpers for timestamps & day dividers ---
  const pad = (n: number) => String(n).padStart(2, "0");
  const toDayKey = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const toTimeHM = (ms: number) => {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Build rendered list with day dividers and per-message timestamps
  const renderedMessages = React.useMemo(() => {
    const out: React.ReactNode[] = [];
    let lastDay: string | null = null;
    (messages || []).forEach((m, i) => {
      const ts = typeof (m as any)?.ts === 'number' ? (m as any).ts : Date.now();
      const day = toDayKey(ts);
      if (day !== lastDay) {
        lastDay = day;
        out.push(
          <div key={`day-${day}`} className="my-3 flex items-center gap-3">
            <div className="flex-1 h-px bg-neutral-800" />
            <div className="text-xs text-neutral-400">{day}</div>
            <div className="flex-1 h-px bg-neutral-800" />
          </div>
        );
      }
      out.push(
        <div key={`${m.role}-${ts}-${i}`} className="px-3 py-2">
          <div className={m.role === 'user' ? 'text-primary' : ''}>
            <div className="prose prose-invert max-w-none">
              {m.role === 'assistant' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
              ) : (
                <>{m.text}</>
              )}
            </div>
            {/* Meta line: citations/model/month + time */}
            <div className="mt-2 text-xs opacity-70 flex items-center gap-2 flex-wrap">
              {m.role === 'assistant' && (m as any)?.meta?.citations?.length ? (
                <>
                  <span>
                    Used data: {(m as any).meta.citations.map((c: any) => c.count ? `${c.type} ${c.count}` : `${c.type}`).join(' · ')}
                  </span>
                  {(m as any).meta?.ctxMonth ? <span>· month {(m as any).meta.ctxMonth}</span> : null}
                  {(m as any).meta?.model ? <span>· {(m as any).meta.model}</span> : null}
                </>
              ) : null}
              <span className="ml-auto text-neutral-400">{toTimeHM(ts)}</span>
            </div>
          </div>
        </div>
      );
    });
    return out;
  }, [messages]);

  function appendUser(text: string) {
    chatStore.append({ role: 'user', content: text, createdAt: Date.now() });
  }

  function appendAssistant(text: string, meta?: any) {
    // Persist minimal assistant message to cross-tab store
    chatStore.append({ role: 'assistant', content: text, createdAt: Date.now() });
    // Keep most recent response metadata in memory for current tab rendering
    setChatResp({
      reply: text,
      citations: meta?.citations || [],
      used_context: { month: meta?.ctxMonth },
      tool_trace: meta?.trace || [],
      model: meta?.model || "",
    } as AgentChatResponse);
  }

  // History toggle (reads directly from messages)
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  
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

  // Load saved model (per-tab)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('fa.model');
      if (saved) setSelectedModel(saved);
    } catch {}
  }, []);

  // Save when it changes (per-tab)
  useEffect(() => {
    try {
      if (selectedModel) sessionStorage.setItem('fa.model', selectedModel);
      else sessionStorage.removeItem('fa.model');
    } catch {}
  }, [selectedModel]);

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
  // keep legacy helper name for response objects (internal use)
  const handleAgentResponse = React.useCallback((resp: AgentChatResponse) => {
    setChatResp(resp);
    if (resp?.reply) appendAssistant(resp.reply, { citations: resp.citations, ctxMonth: resp.used_context?.month, trace: resp.tool_trace, model: resp.model });
  }, []);

  const appendAssistantFromText = React.useCallback((text: string, opts?: { meta?: any }) => {
    appendAssistant(text, opts?.meta);
  }, []);

  React.useEffect(() => {
    // Register handlers so external callers (e.g., Explain buttons) can append into ChatDock
  chat.setAppendAssistant(appendAssistantFromText);
  chat.setAppendUser((text: string) => { appendUser(text); });
  }, [chat, appendAssistantFromText]);

  // Always include context; hold Alt while clicking to omit it.
  const getContext = (ev?: { altKey?: boolean }) => {
    if (ev?.altKey) return null;
    try { return (window as any).__FA_CONTEXT ?? null; } catch { return null; }
  };

  // --- ONE-CLICK TOOL RUNNERS (top bar) ---
  const runMonthSummary = React.useCallback(async (ev?: React.MouseEvent) => {
    if (busy) return;
    setBusy(true);
    try {
      appendUser('Summarize my spending this month in 4 bullets and one action.');
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: 'Summarize my spending this month in 4 bullets and one action.' }],
        intent: 'general',
    context: getContext(ev),
        ...(selectedModel ? { model: selectedModel } : {})
      };
      const resp = await agentChat(req);
      handleAgentResponse(resp);
    } finally {
      setBusy(false);
    }
  }, [busy, selectedModel, handleAgentResponse]);

  const runFindSubscriptions = React.useCallback(async (ev?: React.MouseEvent) => {
    if (busy) return;
    setBusy(true);
    try {
      appendUser('Identify recurring subscriptions this month and suggest which I could cancel.');
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: 'Identify recurring subscriptions this month and suggest which I could cancel.' }],
        intent: 'general',
    context: getContext(ev),
        ...(selectedModel ? { model: selectedModel } : {})
      };
      const resp = await agentChat(req);
      handleAgentResponse(resp);
    } finally {
      setBusy(false);
    }
  }, [busy, selectedModel, handleAgentResponse]);

  // Additional one-click runners shown in the tools tray
  const runTopMerchants = React.useCallback(async (ev?: React.MouseEvent) => {
    if (busy) return;
    setBusy(true);
    try {
      appendUser('Show top merchants for the current month.');
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: 'List the top merchants for the selected month with totals.' }],
        intent: 'general',
        context: getContext(ev),
        ...(selectedModel ? { model: selectedModel } : {})
      };
      const resp = await agentChat(req);
      handleAgentResponse(resp);
    } finally { setBusy(false); }
  }, [busy, selectedModel, handleAgentResponse]);

  const runCashflow = React.useCallback(async (ev?: React.MouseEvent) => {
    if (busy) return;
    setBusy(true);
    try {
      appendUser('Show my cashflow (inflows vs outflows).');
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: 'Show monthly cashflow (inflows vs outflows) for the selected month.' }],
        intent: 'general',
        context: getContext(ev),
        ...(selectedModel ? { model: selectedModel } : {})
      };
      const resp = await agentChat(req);
      handleAgentResponse(resp);
    } finally { setBusy(false); }
  }, [busy, selectedModel, handleAgentResponse]);

  const runTrends = React.useCallback(async (ev?: React.MouseEvent) => {
    if (busy) return;
    setBusy(true);
    try {
      appendUser('Show my spending trends.');
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: 'Show spending trends over recent months with notable changes.' }],
        intent: 'general',
        context: getContext(ev),
        ...(selectedModel ? { model: selectedModel } : {})
      };
      const resp = await agentChat(req);
      handleAgentResponse(resp);
    } finally { setBusy(false); }
  }, [busy, selectedModel, handleAgentResponse]);

  const runInsightsSummary = React.useCallback(async (ev?: React.MouseEvent) => {
    if (busy) return;
    setBusy(true);
    try {
      appendUser('Summarize key insights for this month.');
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: 'Provide a concise insights summary for the selected month.' }],
        intent: 'general',
        context: getContext(ev),
        ...(selectedModel ? { model: selectedModel } : {})
      };
      const resp = await agentChat(req);
      handleAgentResponse(resp);
    } finally { setBusy(false); }
  }, [busy, selectedModel, handleAgentResponse]);

  const runInsightsExpanded = React.useCallback(async (ev?: React.MouseEvent) => {
    if (busy) return;
    setBusy(true);
    try {
      appendUser('Expand insights (month-over-month + anomalies).');
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: 'Expand insights with month-over-month changes and anomalies.' }],
        intent: 'general',
        context: getContext(ev),
        ...(selectedModel ? { model: selectedModel } : {})
      };
      const resp = await agentChat(req);
      handleAgentResponse(resp);
    } finally { setBusy(false); }
  }, [busy, selectedModel, handleAgentResponse]);

  const runBudgetCheck = React.useCallback(async (ev?: React.MouseEvent) => {
    if (busy) return;
    setBusy(true);
    try {
      appendUser('Check my budget status for this month.');
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: 'Run a budget check for the selected month and flag overspends.' }],
        intent: 'general',
        context: getContext(ev),
        ...(selectedModel ? { model: selectedModel } : {})
      };
      const resp = await agentChat(req);
      handleAgentResponse(resp);
    } finally { setBusy(false); }
  }, [busy, selectedModel, handleAgentResponse]);

  const runAlerts = React.useCallback(async (ev?: React.MouseEvent) => {
    if (busy) return;
    setBusy(true);
    try {
      appendUser('Show my alerts.');
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: 'List my alerts for the selected month.' }],
        intent: 'general',
        context: getContext(ev),
        ...(selectedModel ? { model: selectedModel } : {})
      };
      const resp = await agentChat(req);
      handleAgentResponse(resp);
    } finally { setBusy(false); }
  }, [busy, selectedModel, handleAgentResponse]);

  const runSearchTransactions = React.useCallback(async (ev?: React.MouseEvent) => {
    if (busy) return;
    const q = window.prompt('Search transactions (merchant/amount/note):', '');
    if (q == null || q.trim() === '') return;
    setBusy(true);
    try {
      appendUser(`Search transactions: ${q.trim()}`);
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: `Search my transactions: ${q.trim()}` }],
        intent: 'general',
        context: getContext(ev),
        ...(selectedModel ? { model: selectedModel } : {})
      };
      const resp = await agentChat(req);
      handleAgentResponse(resp);
    } finally { setBusy(false); }
  }, [busy, selectedModel, handleAgentResponse]);

  // (inline quick tool buttons removed; using top-bar runners instead)

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
        onPointerDown={startFabDrag}
        title="Open Agent Tools (Ctrl+Shift+K)"
      >
  💬
      </div>
    );
  }

  return (
    <div
      className="fixed z-[70] w-[min(760px,calc(100vw-2rem))] max-h-[80vh] rounded-2xl border border-neutral-700 shadow-xl bg-neutral-900/95 backdrop-blur p-4 flex flex-col min-h-[320px]"
      style={{ right: pos.x, bottom: pos.y }}
    >
      <div
        className="flex items-center gap-2 mb-2 select-none"
        style={{ cursor: "grab" }}
        onPointerDown={startHeaderDrag}
      >
        <div className="text-sm text-neutral-300">Agent Tools</div>
  <div className="ml-auto flex items-center gap-2">
          {/* Export */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation();
              const normalized = (messages || []).map(m => ({ role: m.role, content: m.text, createdAt: m.ts }));
              const firstUser = (messages || []).find(m => m.role === 'user');
              const trimmed = (firstUser?.text || '').split('\n')[0].slice(0, 40).trim();
              const title = trimmed ? `finance-agent-chat—${trimmed.replace(/\s+/g, '_')}` : 'finance-agent-chat';
              exportThreadAsJSON(title, normalized);
            }}
            className="text-xs px-2 py-1 border rounded-md hover:bg-muted"
            title="Download chat as JSON"
          >
            Export JSON
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation();
              const normalized = (messages || []).map(m => ({ role: m.role, content: m.text, createdAt: m.ts }));
              const firstUser = (messages || []).find(m => m.role === 'user');
              const trimmed = (firstUser?.text || '').split('\n')[0].slice(0, 40).trim();
              const title = trimmed ? `finance-agent-chat—${trimmed.replace(/\s+/g, '_')}` : 'finance-agent-chat';
              exportThreadAsMarkdown(title, normalized);
            }}
            className="text-xs px-2 py-1 border rounded-md hover:bg-muted"
            title="Download chat as Markdown"
          >
            Export Markdown
          </button>
          {/* Hide any legacy top-bar tool buttons */}
          {ENABLE_TOPBAR_TOOL_BUTTONS && (
            <div className="hidden" />
          )}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setHistoryOpen(v => !v); }}
            className="text-xs px-2 py-1 border rounded-md hover:bg-muted"
            title="Show recent messages"
          >
            {historyOpen ? 'Hide history' : 'History'}
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setShowTools(v => !v); }}
            aria-expanded={showTools}
            aria-controls="agent-tools-panel"
            className="text-xs px-2 py-1 border rounded-md hover:bg-muted inline-flex items-center gap-1"
            title={showTools ? "Hide tools" : "Show tools"}
          >
            {showTools ? <ChevronUp size={14}/> : <Wrench size={14}/>}
            {showTools ? 'Hide tools' : 'Agent Tools'}
          </button>
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
          <div className="flex items-center gap-2">
            <select
              className="px-2 py-1 text-sm rounded-md bg-neutral-800 border border-neutral-700 text-neutral-100"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              <option value="">{`Default — ${modelsInfo.provider}: ${modelsInfo.default}`}</option>
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

      {/* Agent tools tray (all tools live here; one-click) */}
      {showTools && (
        <div id="agent-tools-panel" className="px-3 py-2 border-b bg-muted/10">
          {/* Tabs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-2">
            <button type="button" onClick={(e) => runMonthSummary(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Month summary</button>
            <button type="button" onClick={(e) => runFindSubscriptions(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Find subscriptions</button>
            <button type="button" onClick={(e) => runTopMerchants(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Top merchants</button>
            <button type="button" onClick={(e) => runCashflow(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Cashflow</button>
            <button type="button" onClick={(e) => runTrends(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Trends</button>
            <button type="button" onClick={(e) => runInsightsSummary(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Insights: Summary</button>
            <button type="button" onClick={(e) => runInsightsExpanded(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Insights: Expanded</button>
            <button type="button" onClick={(e) => runBudgetCheck(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Budget check</button>
            <button type="button" onClick={(e) => runAlerts(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Alerts</button>
            <button type="button" onClick={(e) => runSearchTransactions(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Search transactions…</button>
          </div>
          <div className="text-[11px] opacity-60">Tip: Hold Alt to run without context.</div>

          {ENABLE_LEGACY_TOOL_FORM ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* ... existing payload/result form retained behind flag ... */}
            </div>
          ) : null}
        </div>
      )}

      {/* Collapsible History panel */}
      {historyOpen && (
        <div className="px-3 py-2 border-b bg-muted/5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs opacity-70">This tab’s recent messages</div>
            <button
              className="text-xs px-2 py-1 border rounded-md hover:bg-muted"
              onClick={() => chatStore.clear()}
              title="Clear this tab's chat"
            >
              Clear
            </button>
          </div>
          <div className="max-h-48 overflow-auto space-y-2 text-sm">
            {messages.length === 0 ? (
              <div className="opacity-60 text-xs">No messages yet.</div>
            ) : messages.slice(-50).map((m, i) => (
              <div key={i} className="p-2 rounded-md border">
                <div className="text-[11px] opacity-60 mb-1">
                  {m.role.toUpperCase()} · {new Date(m.ts).toLocaleTimeString()}
                  {m.meta?.model ? ` · ${m.meta.model}` : ''}
                  {m.meta?.ctxMonth ? ` · month ${m.meta.ctxMonth}` : ''}
                </div>
                <div className="prose prose-invert max-w-none text-sm">
                  {m.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

  {/* Inline quick tools removed — use top-bar buttons only to prevent duplication */}

      {/* Messages list (scrollable) with day dividers & timestamps */}
      <div className="flex-1 overflow-auto" ref={listRef}>
        {renderedMessages}
        <div id="chatdock-scroll-anchor" />
      </div>

      {/* Bottom input bar — ALWAYS visible */}
      <div className="p-3 border-t flex items-center gap-2 bg-background sticky bottom-0 z-10">
        <input
          type="text"
          placeholder="Ask the agent…"
          className="flex-1 px-3 py-2 rounded-md border bg-background"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              onSend(draft.trim()); setDraft('');
            }
          }}
        />
        <button
          className="px-3 py-2 rounded-md border hover:bg-muted disabled:opacity-50"
          disabled={!draft.trim() || busy}
          onClick={() => { if (draft.trim()) { onSend(draft.trim()); setDraft(''); } }}
        >
          Send
        </button>
      </div>
    </div>
  );
  // Handler for sending agent chat from input bar
  async function onSend(text: string) {
    setBusy(true);
    try {
  appendUser(text);
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: text }],
        intent: 'general',
        ...(selectedModel ? { model: selectedModel } : {})
      };
  const resp = await agentChat(req);
  handleAgentResponse(resp);
    } finally {
      setBusy(false);
    }
  }
}
