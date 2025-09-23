import * as React from "react";
import { stripToolNamespaces } from "@/utils/prettyToolName";
import SaveRuleModal from '@/components/SaveRuleModal';
const { useEffect, useMemo, useRef, useState } = React;
import { wireAguiStream } from "@/lib/aguiStream";
import RobotThinking from "@/components/ui/RobotThinking";
import EnvAvatar from "@/components/EnvAvatar";
import { useAuth } from "@/state/auth";
import { createPortal } from "react-dom";
import { ChevronUp, Wrench } from "lucide-react";
import { agentTools, agentChat, getAgentModels, type AgentChatRequest, type AgentChatResponse, type AgentModelsResponse, type ChatMessage, txnsQueryCsv, txnsQuery, type TxnQueryResult, explainTxnForChat, agentRephrase, getMonthSummary, getMonthMerchants, getMonthFlows, getSpendingTrends, getBudgetCheck, analytics, transactionsNl } from "../lib/api";
import { fmtMonthSummary, fmtTopMerchants, fmtCashflow, fmtTrends } from "../lib/formatters";
import { runToolWithRephrase } from "../lib/tools-runner";
import { saveAs } from "../utils/save";
// import { useOkErrToast } from "../lib/toast-helpers";
import RestoredBadge from "./RestoredBadge";
import remarkGfm from "remark-gfm";
import Markdown from "./Markdown";
import type { ToolKey, ToolSpec, ToolRunState } from "../types/agentTools";
import { AgentResultRenderer } from "./AgentResultRenderers";
import ErrorBoundary from "./ErrorBoundary";
import { QuickChips, type ChipAction } from "./QuickChips";
import { useMonth } from "../context/MonthContext";
import { useChatDock } from "../context/ChatDockContext";
import { exportThreadAsJSON, exportThreadAsMarkdown } from "../utils/chatExport";
import { chatStore, type BasicMsg, snapshot as chatSnapshot, restoreFromSnapshot as chatRestoreFromSnapshot, discardSnapshot as chatDiscardSnapshot } from "../utils/chatStore";
import runAndRephrase from "./agent-tools/runAndRephrase";
import { registerChatHandlers } from "@/state/chat";
import { DEFAULT_PLACEHOLDER, focusComposer, registerComposerControls, setComposer, setComposerPlaceholder as setComposerPlaceholderUI } from "@/state/chat/ui";
import { handleTransactionsNL } from "./AgentTools";
// --- layout constants (right/bottom anchored) ---
const MARGIN = 24;     // default bottom-right margin
const BUBBLE = 48;     // bubble size (px)
const PANEL_W_GUESS = 640;
const PANEL_H_GUESS = 420;

// Local message types
type MsgRole = 'user' | 'assistant';
type Msg = { role: MsgRole; text: string; ts: number; meta?: any };

// Clamp right/bottom within viewport using element size
function clampRB(next: { right: number; bottom: number }, w: number, h: number) {
  const min = 8;
  const maxRight = Math.max(min, window.innerWidth  - min - w);
  const maxBottom= Math.max(min, window.innerHeight - min - h);
  return {
    right: Math.min(Math.max(min, next.right), maxRight),
    bottom: Math.min(Math.max(min, next.bottom), maxBottom),
  };
}
// Tool groups/specs for legacy form defaults and lookups
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
      { key: "rules.apply",    label: "Rules: Apply",     path: "/agent/tools/rules/apply",     examplePayload: { month: undefined, onlyIfUnlabeled: true, rule: { merchant: "Starbucks", category: "Dining out" } } },
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

declare global { interface Window { __CHATDOCK_MOUNT_COUNT__?: number } }

// Module-scoped singleton tracker
let __CHATDOCK_ACTIVE__: symbol | null = null;

export default function ChatDock() {
  // Safe singleton: claim primary in effect; always run hooks, render only if primary
  const idRef = useRef(Symbol("chatdock"));
  const [isPrimary, setIsPrimary] = useState(false);
  useEffect(() => {
    if (__CHATDOCK_ACTIVE__ === null) {
      __CHATDOCK_ACTIVE__ = idRef.current;
      setIsPrimary(true);
    } else {
      setIsPrimary(__CHATDOCK_ACTIVE__ === idRef.current);
    }
    return () => {
      if (__CHATDOCK_ACTIVE__ === idRef.current) {
        __CHATDOCK_ACTIVE__ = null;
      }
    };
  }, []);
  const { month } = useMonth();
  const chat = useChatDock();
  const [open, setOpen] = React.useState<boolean>(false);
  // one shared right/bottom position for bubble and panel (no persistence)
  const [rb, setRb] = React.useState<{ right: number; bottom: number }>(() => ({ right: MARGIN, bottom: MARGIN }));
  const panelRef = useRef<HTMLDivElement | null>(null);
  const clickGuard = useRef(false);

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
  const [input, setInput] = useState("");
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [composerPlaceholder, setComposerPlaceholderState] = useState(DEFAULT_PLACEHOLDER);
  // AGUI streaming run state (moved earlier so handleSend can reference)
  const [aguiTools, setAguiTools] = useState<Array<{ name: string; status: 'pending'|'active'|'done'|'error'; startedAt?: number; endedAt?: number }>>([]);
  const aguiToolsRef = React.useRef<typeof aguiTools>(aguiTools);
  React.useEffect(()=>{ aguiToolsRef.current = aguiTools; }, [aguiTools]);
  // Track last what-if scenario text for rule saving
  const lastWhatIfScenarioRef = useRef<string>("");
  // Save Rule modal state (new component)
  const [showSaveRuleModal, setShowSaveRuleModal] = useState(false);
  const [saveRuleScenario, setSaveRuleScenario] = useState("");
  const [aguiRunActive, setAguiRunActive] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const syncTimerRef = useRef<number | null>(null);
  // Persist the last successful NL query + resolved filters so we can export without re-prompting
  type LastNlq = { q: string; flow?: "expenses"|"income"|"all"; filters?: any; intent?: string };
  const lastNlqRef = useRef<LastNlq | null>(null);
  // NEW: Tiny tools panel state
  const [showTools, setShowTools] = useState<boolean>(true);
  const [activePreset, setActivePreset] = useState<ToolPresetKey>('insights_expanded');
  const [toolPayload, setToolPayload] = useState<string>(() => JSON.stringify(TOOL_PRESETS['insights_expanded'].defaultPayload ?? {}, null, 2));
  // ML selftest UI removed
  // Undo snackbar (animated) for destructive actions like Clear
  const [undoVisible, setUndoVisible] = React.useState(false);
  const [undoClosing, setUndoClosing] = React.useState(false);
  const [undoMsg, setUndoMsg] = React.useState<string>("Cleared");
  const undoActionRef = React.useRef<null | (() => void)>(null);
  const [restoredVisible, setRestoredVisible] = React.useState(false);

  useEffect(() => {
    return registerComposerControls({
      setValue: (value: string) => setInput(value),
      focus: () => composerRef.current?.focus(),
      setPlaceholder: (value: string) => setComposerPlaceholderState(value),
      getValue: () => composerRef.current?.value ?? "",
    });
  }, [setInput, setComposerPlaceholderState]);

  // --- feature flags to forcibly hide legacy UI ---
  const ENABLE_TOPBAR_TOOL_BUTTONS = false;   // keep a single "Agent tools" toggle
  const ENABLE_LEGACY_TOOL_FORM    = false;   // hide Payload/Result/Insert context/Run
  const ENABLE_AGUI = ((): boolean => {
    try { return String(import.meta.env.VITE_ENABLE_AGUI || '').trim() === '1'; } catch { return false; }
  })();   // experimental AGUI integration

  // Live message stream (render from UI state, persist via chatStore)
  const [uiMessages, setUiMessages] = useState<Msg[]>([]);
  // Equality guard to avoid redundant setState on cross-tab updates
  const sameTimeline = React.useCallback((ui: Msg[], basic: BasicMsg[]) => {
    if (!Array.isArray(ui) || !Array.isArray(basic)) return false;
    if (ui.length !== basic.length) return false;
    if (ui.length === 0) return true;
    const lu = ui[ui.length - 1];
    const lb = basic[basic.length - 1];
    if (!lu || !lb) return false;
    const lbRole = lb.role === 'assistant' ? 'assistant' : 'user';
    return lu.role === lbRole && lu.text === String(lb.content || '') && lu.ts === Number(lb.createdAt || 0);
  }, []);

  const syncFromStore = React.useCallback(() => {
    try {
      const basic = chatStore.get() || [];
      setUiMessages(cur => {
        if (sameTimeline(cur, basic)) return cur;
        const mapped: Msg[] = (basic || []).map((b: { role: string; content: string; createdAt: number }) => ({ role: (b.role === 'assistant' ? 'assistant' : 'user') as MsgRole, text: String(b.content || ''), ts: Number(b.createdAt) || Date.now() }));
        return mapped;
      });
    } catch { /* ignore */ }
  }, [sameTimeline]);

  const syncFromStoreDebounced = React.useCallback((ms = 120) => {
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      syncFromStore();
    }, ms);
  }, [syncFromStore]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [uiMessages, busy]);

  // quick sanity ping so you can confirm the file actually recompiled
  useEffect(() => {
    if (isPrimary) {
      console.log("[ChatDock] v0906f loaded");
    }
    return () => { if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current); };
  }, [isPrimary]);

  // If chat was restored very recently (in this tab), briefly show a Restored badge
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('chat:restored_at');
      if (!raw) return;
      const t = Number(raw);
      if (Number.isFinite(t) && Date.now() - t < 30_000) {
        setRestoredVisible(true);
        window.setTimeout(() => setRestoredVisible(false), 4500);
      }
      sessionStorage.removeItem('chat:restored_at');
    } catch {}
  }, []);

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

  const { user } = useAuth();
  const userName = user?.email?.split("@")[0] ?? "You";

  const appendAssistant = React.useCallback((text: string, meta?: any) => {
    const ts = Date.now();
    const metaPayload: Record<string, any> = { ...(meta ?? {}) };
    if (!metaPayload.used_context && metaPayload.ctxMonth) {
      metaPayload.used_context = { month: metaPayload.ctxMonth };
    }
    setUiMessages(cur => [...cur, { role: 'assistant', text, ts, meta: metaPayload }]);
    chatStore.append({ role: 'assistant', content: text, createdAt: ts });
    try { chatDiscardSnapshot(); } catch { /* ignore */ }
    setChatResp({
      reply: text,
      citations: metaPayload.citations || [],
      used_context: metaPayload.used_context || { month: metaPayload.ctxMonth },
      tool_trace: metaPayload.trace || metaPayload.tool_trace || [],
      model: metaPayload.model || "",
      mode: metaPayload.mode,
      args: metaPayload.args,
      suggestions: metaPayload.suggestions || [],
      rephrased: Object.prototype.hasOwnProperty.call(metaPayload, 'rephrased') ? metaPayload.rephrased : undefined,
    } as any);
  }, [setUiMessages, setChatResp]);

  // Build rendered list with day dividers and per-message timestamps
  const renderedMessages = React.useMemo(() => {
    const out: React.ReactNode[] = [];
    let lastDay: string | null = null;
    (uiMessages || []).forEach((m, i) => {
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
      const isUser = m.role === 'user';
      const meta = ((m as any).meta ?? (i === (uiMessages.length - 1) ? (chatResp as any) : undefined)) || {};
      const isThinking = (m as any).thinking || (m as any).meta?.thinking;
      out.push(
        <div key={`${m.role}-${ts}-${i}`} className={`px-3 py-2 my-1 flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
          {!isUser && <EnvAvatar who="agent" className="size-7" />}
          <div className={`max-w-[72%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${isUser ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-800 text-slate-100 rounded-bl-sm'}`}>
            {isThinking ? (
              <div className="py-1"><span className="sr-only">Thinking.</span><RobotThinking size={32} /></div>
            ) : (
              m.role === 'assistant' ? <div className="chat-markdown"><Markdown>{m.text}</Markdown></div> : <>{m.text}</>
            )}
          </div>
          {isUser && <EnvAvatar who="user" className="size-7" title={userName} />}
        </div>
      );
      // Meta line under each message (add ModeChip + ForecastFollowUps when applicable)
      out.push(
        <div key={`${m.role}-${ts}-${i}-meta`} className="px-3">
          <div className="mt-2 text-xs opacity-70 flex items-center gap-2 flex-wrap">
            {m.role === 'assistant' && Array.isArray(meta.citations) && meta.citations.length ? (
              <>
                <span>
                  Used data: {meta.citations.map((c: any) => c.count ? `${c.type} ${c.count}` : `${c.type}`).join(' | ')}
                </span>
                {meta.used_context?.month ? <span>- month {meta.used_context.month}</span> : null}
                {meta.model ? <span>- {meta.model}</span> : null}
              </>
            ) : null}
            {m.role === 'assistant' && meta.intent_label ? (
              <span className="intent-badge">{meta.intent_label}</span>
            ) : null}
            {m.role === 'assistant' ? <ModeChip mode={meta.mode} args={meta.args} /> : null}
            <span className="ml-auto text-neutral-400">{toTimeHM(ts)}</span>
          </div>
          {m.role === 'assistant' && meta.mode === 'analytics.forecast' ? (
            <ForecastFollowUps month={meta.used_context?.month} append={appendAssistant} setThinking={setBusy} />
          ) : null}
          {m.role === 'assistant' ? (() => {
            const model = Array.isArray(meta.suggestionsLLM) ? meta.suggestionsLLM : [];
            const gateway = Array.isArray(meta.suggestions) ? meta.suggestions : [];
            const raw = [...model, ...gateway];
            const seen = new Set<string>();
            const chips = raw.filter((c: any) => {
              if (!c || typeof c !== 'object') return false;
              const label = String(c.label || c.query || c.value || '').trim();
              if (!label) return false;
              const key = (c.action || '') + '::' + label;
              if (seen.has(key)) return false;
              seen.add(key);
              c.label = label;
              return true;
            });
            if (!chips.length) return null;
            return (
              <div className="flex flex-wrap gap-2 mt-2">
                {chips.map((chip: any) => (
                  <button
                    key={(chip.action || 'noop') + chip.label}
                    type="button"
                    role="button"
                    tabIndex={0}
                    aria-label={`Suggestion: ${chip.label}`}
                    className={`chip ${chip.source === 'gateway' ? 'chip-suggest-gw' : 'chip-suggest'}`}
                    onKeyDown={(e)=>{ if (e.key==='Enter'||e.key===' ') { e.preventDefault(); handleSuggestionChip({ label: chip.label, action: chip.action || chip.label, source: chip.source }); } }}
                    onClick={()=>handleSuggestionChip({ label: chip.label, action: chip.action || chip.label, source: chip.source })}
                  >{chip.label}</button>
                ))}
              </div>
            );
          })() : null}
        </div>
      );
    });
    return out;
  }, [appendAssistant, setBusy, uiMessages, userName, chatResp]);

  // Event delegation for Explain buttons inside rendered markdown
  useEffect(() => {
    const root = listRef.current;
    if (!root) return;
    const onClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('[data-explain-id]') as HTMLElement | null;
      if (!btn) return;
      e.preventDefault();
      const id = btn.getAttribute('data-explain-id');
      if (!id) return;
      try {
        setBusy(true);
        const res = await explainTxnForChat(id);
        const text = res.reply || "(no explanation)";
        appendAssistant(text, { citations: res.meta?.citations, ctxMonth: res.meta?.ctxMonth, model: res.meta?.model });
      } catch (err: any) {
        appendAssistant(`Failed to explain transaction ${id}: ${err?.message || String(err)}`);
      } finally {
        setBusy(false);
      }
    };
    root.addEventListener('click', onClick as any);
    return () => root.removeEventListener('click', onClick as any);
  }, [listRef, appendAssistant, setBusy]);

  // Helper to show the Undo snackbar with exit animation.
  function showUndo(msg: string, onUndo?: () => void) {
    setUndoMsg(msg);
    undoActionRef.current = onUndo ?? null;
    setUndoClosing(false);
    setUndoVisible(true);
    // Auto-close after 5s, then animate out for 4.5s
    window.setTimeout(() => {
      setUndoClosing(true); // triggers animate-fade-slide-up
      window.setTimeout(() => setUndoVisible(false), 4500);
    }, 5000);
  }

  const appendUser = React.useCallback((text: string) => {
    const ts = Date.now();
    setUiMessages(cur => [...cur, { role: 'user', text, ts }]); // optimistic UI
    chatStore.append({ role: 'user', content: text, createdAt: ts });
  // If a snapshot exists from a recent Clear, discard it once new chat starts
  try { chatDiscardSnapshot(); } catch { /* ignore */ }
  }, [setUiMessages]);

  // (appendAssistant moved above first usage)

  // History toggle (reads directly from messages)
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);

  // Clear history handler (with snapshot + animated Undo)
  const handleClearHistory = React.useCallback(() => {
    const existing = chatStore.get();
    if (!existing?.length) return;
    try {
      const ok = window.confirm('Clear chat history across tabs?');
      if (!ok) return;
    } catch { /* ignore */ }
    // 1) take snapshot for undo
    const snap = chatSnapshot();
    // 2) clear store and local UI
    try {
      chatStore.clear();
      setUiMessages([]);
    } catch (e) { /* ignore */ }
    // 3) offer undo that restores snapshot via chatStore
    showUndo('Chat cleared', () => {
      const res = chatRestoreFromSnapshot();
      if (res.ok) {
        try {
          const restored = chatStore.get() || [];
          const mapped = (restored || []).map(b => ({
            role: (b.role === 'assistant' ? 'assistant' : 'user') as MsgRole,
            text: String(b.content || ''),
            ts: Number(b.createdAt) || Date.now(),
          }));
          setUiMessages(mapped);
        } catch { /* ignore */ }
  try { sessionStorage.setItem('chat:restored_at', String(Date.now())); } catch {}
  setRestoredVisible(true);
  window.setTimeout(() => setRestoredVisible(false), 4500);
        try { /* optional: clear snapshot explicitly if needed */ chatDiscardSnapshot(); } catch {}
      }
      // close snackbar shortly after click
      setUndoClosing(true);
      window.setTimeout(() => setUndoVisible(false), 800);
    });
  }, []);

  const mapBasicToMsg = React.useCallback((arr: BasicMsg[]): Msg[] => {
    return (arr || []).map(b => ({ role: (b.role === 'assistant' ? 'assistant' : 'user') as MsgRole, text: String(b.content || ''), ts: Number(b.createdAt) || Date.now() }));
  }, []);

  // no-op cleanup needed for new snackbar timers (scoped to showUndo)
  
  // Auto-run state for debounced month changes
  const isAutoRunning = useRef(false);
  const debounceTimer = useRef<number | null>(null);

  // stop saving/restoring "open"; clean any legacy value once
  React.useEffect(() => { localStorage.removeItem("chatdock_open"); }, []);
  // no persistence for positions
  // keep coords sane on resize
  useEffect(() => {
    const onResize = () => {
    const rect = panelRef.current?.getBoundingClientRect();
    const w = rect?.width ?? (open ? PANEL_W_GUESS : BUBBLE);
    const h = rect?.height ?? (open ? PANEL_H_GUESS : BUBBLE);
  setRb((prev: { right: number; bottom: number }) => clampRB(prev, w, h));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);
  // fetch models (best-effort)
  React.useEffect(() => { (async () => {
    try { const info = await getAgentModels(); setModelsInfo(info || null); } catch { /* ignore */ }
  })(); }, []);

  // When opening the panel, immediately clamp rb to the actual panel size
  useEffect(() => {
    if (!open) return;
    // wait for layout to settle then measure and clamp
    requestAnimationFrame(() => {
      const rect = panelRef.current?.getBoundingClientRect();
      const w = rect?.width ?? PANEL_W_GUESS;
      const h = rect?.height ?? PANEL_H_GUESS;
  setRb((prev: { right: number; bottom: number }) => clampRB(prev, w, h));
    });
  }, [open]);

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
  if (e.key.toLowerCase() === "k" && e.shiftKey && e.ctrlKey) { e.preventDefault(); setOpen((v: boolean) => !v); }
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
  setPayloads((p: Record<string, string>) => ({ ...p, [tool]: newText }));
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
  setPayloads((p: Record<string, string>) => ({ ...p, [tool]: newText }));
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

      // 2) Force LLM rephrase to show the thinking bubble in chat
      try {
        setBusy(true);
        const pretty = (function prettyFormat(toolKey: ToolKey, payload: any): string {
          try {
            if (toolKey === 'charts.summary' && payload) {
              const m = payload?.month ? ` - ${payload.month}` : '';
              const income = payload?.income ?? payload?.total_income ?? 0;
              const spend = payload?.spend ?? payload?.total_spend ?? 0;
              const net = payload?.net ?? (income - Math.abs(spend));
              return `Month summary${m}\n\n- Income: $${Number(income).toFixed(0)}\n- Spend: $${Math.abs(Number(spend)).toFixed(0)}\n- Net: $${Number(net).toFixed(0)}\n\nOne recommendation:`;
            }
            if (toolKey === 'charts.merchants' && Array.isArray(payload?.merchants)) {
              const m = payload?.month ? ` - ${payload.month}` : '';
              const lines = payload.merchants.slice(0, 5).map((it: any) => `- ${it.merchant}: $${Math.abs(Number(it.amount||0)).toFixed(0)}`);
              return `Top merchants${m}\n\n${lines.join('\n')}\n\nSummarize and suggest one action.`;
            }
            if (toolKey === 'charts.trends' && Array.isArray(payload?.series)) {
              const lines = payload.series.slice(-6).map((it: any) => `- ${it.month}: income $${Number(it.income||0).toFixed(0)}, spend $${Math.abs(Number(it.spend||it.spending||0)).toFixed(0)}, net $${Number(it.net||0).toFixed(0)}`);
              return `Spending trends\n\n${lines.join('\n')}\n\nSummarize the trend in 3 bullets and one next step.`;
            }
            if (toolKey === 'insights.expanded' && payload) {
              const m = payload?.month ? ` - ${payload.month}` : '';
              const inc = payload?.summary?.income ?? 0;
              const spd = payload?.summary?.spend ?? 0;
              const unk = payload?.unknown_spend?.amount ? Math.abs(Number(payload.unknown_spend.amount)).toFixed(0) : null;
              const bullets = [
                `Income: $${Number(inc).toFixed(0)}`,
                `Spend: $${Math.abs(Number(spd)).toFixed(0)}`,
              ];
              if (unk) bullets.push(`Unknown spend: $${unk}`);
              return `Expanded insights${m}\n\n- ${bullets.join('\n- ')}\n\nRephrase clearly with MoM highlights if present, then one actionable tip.`;
            }
          } catch {}
          // Generic fallback: pretty JSON
          return `Rephrase this result for the user, concise and clear.\n\n${JSON.stringify(payload, null, 2)}`;
        })(tool, data);
        const llm = await agentRephrase(pretty);
        appendAssistant(llm.reply, { model: llm.model });
      } finally {
        setBusy(false);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setState({ loading: false, error: e?.message ?? "Request failed", data: null });
      }
    } finally {
      runningRef.current = null;
    }
  }, [tool, payloadText, month]);

  // Lightweight tool palette -> uses unified /agent/chat
  // keep legacy helper name for response objects (internal use)
  const handleAgentResponse = React.useCallback((resp: AgentChatResponse) => {
    setChatResp(resp);
    if (resp?.reply) appendAssistant(resp.reply, { citations: resp.citations, ctxMonth: resp.used_context?.month, trace: resp.tool_trace, model: resp.model });
  }, [appendAssistant]);

  const appendAssistantFromText = React.useCallback((text: string, opts?: { meta?: any }) => {
    appendAssistant(text, opts?.meta);
  }, [appendAssistant]);

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

  // Composer send (optimistic append + context-aware) REPLACED to support AGUI SSE
  function aguiLog(evt: string, data: any) { try { console.debug(`[agui] ${evt}`, data); } catch {} }
  const handleSend = React.useCallback(async (ev?: React.MouseEvent | React.KeyboardEvent) => {
    if (busy) return;
    const text = input.trim();
    if (!text) return;
    if (ENABLE_AGUI) {
      // Unified AGUI streaming via wireAguiStream
      appendUser(text);
      setInput("");
      setComposerPlaceholderUI(DEFAULT_PLACEHOLDER);
      focusComposer();
      setBusy(true);
      setAguiTools([]);
      setAguiRunActive(true);
      let aggregated = '';
      aguiLog('agui.run', { from: 'text', month, q: text });
      wireAguiStream({ q: text, month }, {
        onStart(meta) { appendAssistant('...', { thinking: true }); if (meta?.intent) setIntentBadge(meta.intent); },
        onIntent(intent) { setIntentBadge(intent); },
        onToolStart(name) {
          aguiLog('agui.tool', { name, status: 'start' });
          setAguiTools(cur => {
            const exists = cur.find(t => t.name === name);
            if (exists) return cur.map(t => t.name === name ? { ...t, status: 'active', startedAt: t.startedAt || Date.now() } : t);
            return [...cur, { name, status: 'active', startedAt: Date.now() }];
          });
        },
        onToolEnd(name, ok) {
          aguiLog('agui.tool', { name, status: 'end', ok });
          setAguiTools(cur => cur.map(t => t.name === name ? { ...t, status: ok ? 'done' : 'error', endedAt: Date.now() } : t));
        },
        onChunk(chunk) { aggregated += chunk; },
        onSuggestions(chips) {
          const tagged = chips.map(c => ({ ...c, source: 'gateway' }));
            aguiLog('agui.suggestions', { count: tagged.length, source: 'gateway' });
          setUiMessages(cur => cur.map((m,i)=> {
            const thinking = (m as any).thinking || (m as any).meta?.thinking;
            return (i===cur.length-1 && m.role==='assistant' && thinking)
              ? { ...m, meta: { ...(m.meta||{}), suggestions: tagged, thinking: true } }
              : m;
          }));
        },
        onFinish() {
          const snapshot = aguiToolsRef.current || aguiTools;
          const errors = snapshot.filter(t => t.status === 'error').map(t => t.name);
          if (errors.length) {
            const pretty = errors.map(stripToolNamespaces);
            aggregated += `\n\n⚠️ Skipped: ${pretty.join(', ')} (unavailable). I used everything else.`;
          }
          setBusy(false); setAguiRunActive(false); appendAssistant(aggregated || '(no content)');
        },
        onError() {
          setBusy(false); setAguiRunActive(false); appendAssistant('(stream error – fallback)');
        }
      });
      return;
    }
    setInput("");
    setComposerPlaceholderUI(DEFAULT_PLACEHOLDER);
    focusComposer();
    appendUser(text);
    setBusy(true);
    try {
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: text }],
        intent: 'general',
        context: getContext(ev as any),
        ...(selectedModel ? { model: selectedModel } : {})
      };
      const resp = await agentChat(req);
      handleAgentResponse(resp);
      syncFromStoreDebounced(120);
    } catch (e: any) {
      appendAssistant(`Send failed: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, input, selectedModel, handleAgentResponse, month, appendUser, appendAssistant]);

  const onComposerKeyDown = React.useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend(e); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); }
  }, [handleSend]);

  // --- ONE-CLICK TOOL RUNNERS (top bar) ---
  const runMonthSummary = React.useCallback(async (_ev?: React.MouseEvent) => {
    if (busy) return;
  if (startAguiRun('overview', AGUI_ACTIONS['overview'].prompt, month)) return;
    setBusy(true);
    try {
      appendUser('Summarize my spending this month in 4 bullets and one action.');
      await runToolWithRephrase(
  'charts.month_summary',
        () => agentTools.chartsSummary({ month: month || '', include_daily: false } as any),
        (raw: any) => {
          const norm = {
            income_total: raw?.total_inflows ?? 0,
            spend_total: raw?.total_outflows ?? 0,
            net: raw?.net ?? (raw?.total_inflows ?? 0) - Math.abs(raw?.total_outflows ?? 0),
            categories: [],
          };
          return fmtMonthSummary(month || '', norm);
        },
  (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
  (on) => setBusy(on),
  () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant]);

  const runFindSubscriptions = React.useCallback(async (_ev?: React.MouseEvent) => {
    if (busy) return;
  if (startAguiRun('subscriptions', AGUI_ACTIONS['subscriptions'].prompt, month)) return;
    setBusy(true);
    try {
      appendUser('Identify recurring subscriptions this month and suggest which I could cancel.');
      await runToolWithRephrase(
        'analytics.subscriptions',
        () => analytics.subscriptions(month),
        (raw: any) => `Identify likely subscriptions for ${month} and which to cancel, with reasons:\n\n${JSON.stringify(raw)}`,
        (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
        (on) => setBusy(on),
        () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStoreDebounced(120);
    } finally {
      setBusy(false);
    }
  }, [busy, month, appendAssistant, selectedModel]);

  // Additional one-click runners shown in the tools tray
  const runTopMerchants = React.useCallback(async (_ev?: React.MouseEvent) => {
    if (busy) return;
  if (startAguiRun('merchants', AGUI_ACTIONS['merchants'].prompt, month)) return;
    setBusy(true);
    try {
      appendUser('Show top merchants for the current month.');
      await runToolWithRephrase(
        'charts.month_merchants',
  // Use Agent Tools POST to ensure auth + month-aware behavior
  () => agentTools.chartsMerchants({ month: month || '', limit: 10 }),
        (raw: any) => fmtTopMerchants(month || '', raw?.merchants || raw || []),
  (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
  (on) => setBusy(on),
  () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant]);

  const runCashflow = React.useCallback(async (_ev?: React.MouseEvent) => {
    if (busy) return;
  if (startAguiRun('cashflow', AGUI_ACTIONS['cashflow'].prompt, month)) return;
    setBusy(true);
    try {
      appendUser('Show my cashflow (inflows vs outflows).');
      await runToolWithRephrase(
        'charts.month_flows',
  // Use Agent Tools POST to avoid GET auth issues
  () => agentTools.chartsFlows({ month: month || '' }),
        (raw) => fmtCashflow(month || '', raw as any),
  (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
  (on) => setBusy(on),
  () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant]);

  const runTrends = React.useCallback(async (_ev?: React.MouseEvent) => {
    if (busy) return;
  if (startAguiRun('overview', AGUI_ACTIONS['trends'].prompt, month)) return;
    setBusy(true);
    try {
      appendUser('Show my spending trends.');
      await runToolWithRephrase(
        'charts.spending_trends',
  // Prefer Agent Tools POST with selected month and months_back window
  () => agentTools.chartsSpendingTrends({ month: month || '', months_back: 6 }) as any,
  (raw: any) => fmtTrends(raw?.trends || raw?.series || raw || []),
  (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
  (on) => setBusy(on),
  () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant]);

  // Debug: confirm onClick bindings are in place for the current month
  useEffect(() => {
    console.debug('[bind] Month summary handler attached', month);
    console.debug('[bind] Top merchants handler attached', month);
    console.debug('[bind] Cashflow handler attached', month);
    console.debug('[bind] Trends handler attached', month);
    console.debug('[bind] Insights (summary/expanded) handlers attached', month);
    console.debug('[bind] Budget check handler attached', month);
  }, [month]);

  const runInsightsSummary = React.useCallback(async (_ev?: React.MouseEvent) => {
    if (busy) return;
  if (startAguiRun('overview', AGUI_ACTIONS['insights-summary'].prompt, month)) return;
    setBusy(true);
    try {
      appendUser('Summarize key insights for this month.');
      await runToolWithRephrase(
        'insights.expanded',
        () => agentTools.insightsExpanded({ month }),
        (raw) => `Turn these insights for ${month} into a friendly paragraph with one recommendation: ${JSON.stringify(raw)}`,
  (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
  (on) => setBusy(on),
  () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStore();
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant]);

  const runInsightsExpanded = React.useCallback(async (_ev?: React.MouseEvent) => {
    if (busy) return;
  if (startAguiRun('overview', AGUI_ACTIONS['insights-expanded'].prompt, month)) return;
    setBusy(true);
    try {
      appendUser('Expand insights (month-over-month + anomalies).');
      await runToolWithRephrase(
        'insights.expanded',
        () => agentTools.insightsExpanded({ month }),
        (raw) => `Expand insights for ${month} with MoM and anomalies: ${JSON.stringify(raw)}`,
  (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
  (on) => setBusy(on),
  () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStore();
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant]);

  const runBudgetCheck = React.useCallback(async (_ev?: React.MouseEvent) => {
    if (busy) return;
  if (startAguiRun('budget', AGUI_ACTIONS['budget'].prompt, month)) return;
    setBusy(true);
    try {
      appendUser('Check my budget status for this month.');
      await runToolWithRephrase(
        'budget.check',
  // Use Agent Tools POST variant with month
  () => agentTools.budgetCheck({ month: month || '' }),
        (raw) => `Summarize this budget status for ${month}: ${JSON.stringify(raw)}`,
  (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
  (on) => setBusy(on),
  () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStore();
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant]);

  // ---------- Analytics quick buttons ----------
  const runAnalyticsKpis = React.useCallback(async (_ev?: React.MouseEvent) => {
    if (busy) return;
  if (startAguiRun('kpis', AGUI_ACTIONS['kpis'].prompt, month)) return;
    setBusy(true);
    try {
      appendUser('Show KPIs for this month.');
      await runToolWithRephrase(
        'analytics.kpis',
        () => analytics.kpis(month),
        (raw: any) => `Summarize these KPIs for ${month} in 3 bullets and one suggestion:\n\n${JSON.stringify(raw)}`,
        (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
        (on) => setBusy(on),
        () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant, selectedModel]);

  const runAnalyticsForecast = React.useCallback(async (_ev?: React.MouseEvent) => {
    if (busy) return;
  // forecast not a dedicated branch yet; legacy path
    setBusy(true);
    try {
      appendUser('Forecast my next 3 months cashflow.');
      await runToolWithRephrase(
        'analytics.forecast',
  () => analytics.forecast(month, 3, { model: "auto", ciLevel: 0.8 }),
        (raw: any) => `Explain this cashflow forecast for ${month} and what it means:\n\n${JSON.stringify(raw)}`,
        (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
        (on) => setBusy(on),
        () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant, selectedModel]);

  const runAnalyticsAnomalies = React.useCallback(async (_ev?: React.MouseEvent) => {
    if (busy) return;
  // anomalies not a dedicated branch yet; legacy path
    setBusy(true);
    try {
      appendUser('Find anomalies this month.');
      await runToolWithRephrase(
        'analytics.anomalies',
        () => analytics.anomalies(month),
        (raw: any) => `List any spending anomalies for ${month} and suggest actions:\n\n${JSON.stringify(raw)}`,
        (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
        (on) => setBusy(on),
        () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant, selectedModel]);

  const runAnalyticsRecurring = React.useCallback(async (_ev?: React.MouseEvent) => {
    if (busy) return;
  if (startAguiRun('subscriptions', AGUI_ACTIONS['recurring'].prompt, month)) return;
    setBusy(true);
    try {
      appendUser('Detect recurring charges.');
      await runToolWithRephrase(
        'analytics.recurring',
        () => analytics.recurring(month),
        (raw: any) => `Summarize recurring charges for ${month}, with likely subscriptions highlighted:\n\n${JSON.stringify(raw)}`,
        (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
        (on) => setBusy(on),
        () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant, selectedModel]);

  const runAnalyticsBudgetSuggest = React.useCallback(async (_ev?: React.MouseEvent) => {
    if (busy) return;
  if (startAguiRun('budget', AGUI_ACTIONS['budget-suggest'].prompt, month)) return;
    setBusy(true);
    try {
      appendUser('Suggest budget targets.');
      await runToolWithRephrase(
        'analytics.budget_suggest',
        () => analytics.budgetSuggest(month),
        (raw: any) => `Propose budget targets for ${month} from these stats, in a short list:\n\n${JSON.stringify(raw)}`,
        (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
        (on) => setBusy(on),
        () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant, selectedModel]);

  const callTransactionsNl = React.useCallback(async (payload?: Record<string, any>) => {
    if (busy) return null;

    const data = payload ?? {};
    const query = typeof data.query === 'string' ? data.query.trim() : '';
    const filters = data.filters;

    if (query) {
      appendUser(query);
    }

    setComposer('');
    setComposerPlaceholderUI(DEFAULT_PLACEHOLDER);
    focusComposer();

    try {
      setBusy(true);
      const response = await transactionsNl(data);
      const meta = (response as any)?.meta ?? {};
      const suggestions = Array.isArray(meta.suggestions) ? meta.suggestions : undefined;
      const metaPayload: Record<string, any> = { ...meta, rephrased: response.rephrased };
      if (suggestions !== undefined) metaPayload.suggestions = suggestions;
      appendAssistant(response.reply, metaPayload);

      const filtersForLast: any = meta.filters ?? filters ?? null;
      if (filtersForLast) {
        lastNlqRef.current = {
          q: query || (typeof meta.query === 'string' ? meta.query : query),
          filters: filtersForLast,
          flow: filtersForLast?.flow,
          intent: (meta.result && (meta.result as any)?.intent) || meta.intent || undefined,
        };
      } else if (query) {
        lastNlqRef.current = {
          q: query,
          filters: {},
          intent: (meta.result && (meta.result as any)?.intent) || meta.intent || undefined,
        };
      }

      return response;
    } catch (err: any) {
      const message = err?.message ? String(err.message) : String(err ?? 'Unknown error');
      appendAssistant(`**transactions.nl failed:** ${message}`);
      throw err;
    } finally {
      setBusy(false);
      syncFromStoreDebounced(120);
    }
  }, [appendAssistant, appendUser, busy, focusComposer, setBusy, setComposer, setComposerPlaceholderUI, syncFromStoreDebounced, transactionsNl]);

  // Insert AGUI feature flag and streaming helper near top-level utility section
  // (legacy runAguiStream removed in favor of wireAguiStream)

  // Central mapping of AGUI actions to prompts + forced gateway mode
  const AGUI_ACTIONS: Record<string, { prompt: string; mode: string }> = {
    'overview':         { prompt: 'Give me this month’s overview summary.', mode: 'overview' },
    'subscriptions':    { prompt: 'Identify recurring subscriptions this month and suggest which I could cancel.', mode: 'subscriptions' },
    'merchants':        { prompt: 'Show top merchants for the current month.', mode: 'merchants' },
    'cashflow':         { prompt: 'Show my cashflow breakdown for this month.', mode: 'cashflow' },
    'trends':           { prompt: 'Show spending trends for this month versus prior month.', mode: 'overview' },
    'insights-summary': { prompt: 'Summarize key insights for this month.', mode: 'overview' },
    'insights-expanded':{ prompt: 'Give me expanded insights for this month (last 60 days if needed).', mode: 'overview' },
    'budget':           { prompt: 'Check my budget status for this month.', mode: 'budget' },
    'kpis':             { prompt: 'Show KPIs for this month.', mode: 'kpis' },
    'forecast':         { prompt: 'Forecast next month’s spending.', mode: 'forecast' },
    'anomalies':        { prompt: 'Show anomalies or unusual transactions for this month.', mode: 'anomalies' },
    'recurring':        { prompt: 'List recurring charges this month.', mode: 'subscriptions' },
    'budget-suggest':   { prompt: 'Suggest budget targets for this month.', mode: 'budget' },
    'what-if':          { prompt: 'What if I reduce dining by 20% next month?', mode: 'what-if' },
    'alerts':           { prompt: 'Show my alerts for this month.', mode: 'alerts' },
    'search-txns':      { prompt: 'Search transactions matching my last query.', mode: 'txns' },
  };

  // Intent label mapping for badge display
  const INTENT_LABELS: Record<string,string> = {
    overview:'Overview', merchants:'Merchants', kpis:'KPIs', subscriptions:'Subscriptions',
    alerts:'Alerts', anomalies:'Anomalies', budget:'Budget', cashflow:'Cashflow',
    forecast:'Forecast', 'what-if':'What-if', txns:'Transactions', chat:'Chat'
  };

  // Minimal badge injection: attach to last assistant thinking bubble meta
  function setIntentBadge(intent?: string) {
    if (!intent) return;
    const label = INTENT_LABELS[intent] || intent;
    setUiMessages(cur => cur.map((m, i) => {
      const thinking = (m as any).thinking || (m as any).meta?.thinking;
      if (i === cur.length - 1 && m.role === 'assistant' && thinking) {
        return { ...m, meta: { ...(m.meta||{}), intent_label: label, intent, thinking: true }, thinking: (m as any).thinking };
      }
      return m;
    }));
  }

  // Start an AGUI streaming run forcing a branch via mode; returns true if started
  function startAguiRun(mode: string, prompt: string, monthCtx?: string | null) {
    if (!ENABLE_AGUI) return false;
    appendUser(prompt);
    setBusy(true);
    setAguiTools([]);
    setAguiRunActive(true);
    let aggregated = '';
    if (mode === 'what-if') { lastWhatIfScenarioRef.current = prompt; }
    aguiLog('agui.run', { from: 'button', mode, month: monthCtx, q: prompt });
    wireAguiStream({ q: prompt, month: monthCtx || undefined, mode }, {
      onStart(meta) { appendAssistant('...', { thinking: true }); if (meta?.intent) setIntentBadge(meta.intent); },
      onIntent(intent) { setIntentBadge(intent); },
      onToolStart(name) {
        aguiLog('agui.tool', { name, status: 'start' });
        setAguiTools(cur => {
          const exists = cur.find(t => t.name === name);
          if (exists) return cur.map(t => t.name === name ? { ...t, status: 'active', startedAt: t.startedAt || Date.now() } : t);
          return [...cur, { name, status: 'active', startedAt: Date.now() }];
        });
      },
      onToolEnd(name, ok) {
        aguiLog('agui.tool', { name, status: 'end', ok });
        setAguiTools(cur => cur.map(t => t.name === name ? { ...t, status: ok ? 'done' : 'error', endedAt: Date.now() } : t));
      },
      onChunk(txt) { aggregated += txt; },
      onSuggestions(chips) {
        const tagged = chips.map(c => ({ ...c, source: 'gateway' }));
        aguiLog('agui.suggestions', { count: tagged.length, source: 'gateway' });
        setUiMessages(cur => cur.map((m,i)=> {
          const thinking = (m as any).thinking || (m as any).meta?.thinking;
          return (i===cur.length-1 && m.role==='assistant' && thinking)
            ? { ...m, meta: { ...(m.meta||{}), suggestions: tagged, thinking: true } }
            : m;
        }));
      },
      onFinish() {
        const snapshot = aguiToolsRef.current || aguiTools;
        const errors = snapshot.filter(t => t.status === 'error').map(t => t.name);
        if (errors.length) {
          const pretty = errors.map(stripToolNamespaces);
            aggregated += `\n\n⚠️ Skipped: ${pretty.join(', ')} (unavailable). I used everything else.`;
        }
        // Emit additional gateway suggestions based on last run context (KPI & Merchants heuristics)
        try {
          const extra: any[] = [];
          // If a forecast was run, suggest budgeting and saving rule directly
          if (/forecast/i.test(aggregated)) {
            extra.push({ label: 'Apply this forecast budget', action: 'apply_budget' });
            extra.push({ label: 'Save as rule', action: 'save_rule' });
          }
          // If merchants mentioned (simple keyword scan), suggest merchant spend insights
          if (/merchant|store|shop/i.test(aggregated)) {
            extra.push({ label: 'Show top merchants', action: 'top_merchants' });
            extra.push({ label: 'Merchant spend trend', action: 'merchant_trend' });
          }
          if (extra.length) {
            setUiMessages(cur => cur.map((m,i)=> {
              const isLast = i===cur.length-1;
              if (!isLast || m.role !== 'assistant') return m;
              const meta = (m as any).meta || {};
              const existing = Array.isArray(meta.suggestions) ? meta.suggestions : [];
              // de-dupe by action+label
              const seen = new Set(existing.map((c:any)=> (c.action||'')+'::'+c.label));
              const merged = [...existing];
              for (const e of extra) {
                const key = (e.action||'')+'::'+e.label;
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push({ ...e, source: 'gateway' });
              }
              return { ...m, meta: { ...meta, suggestions: merged } };
            }));
          }
        } catch (err) { /* non-fatal */ }
        setBusy(false); setAguiRunActive(false); appendAssistant(aggregated || '(no content)');
      },
  onError() { setBusy(false); setAguiRunActive(false); appendAssistant('(stream error – fallback)'); }
    });
    return true;
  }

  useEffect(() => {
    return registerChatHandlers({
      pushAssistant: ({ reply, rephrased, suggestions, meta }) => {
        const metaPayload: Record<string, any> = { ...(meta ?? {}) };
        if (typeof rephrased !== 'undefined') metaPayload.rephrased = rephrased;
        if (Array.isArray(suggestions)) metaPayload.suggestionsLLM = suggestions.map(s => ({ ...(typeof s==='object'?s:{ label: s }), source: 'model', label: (s as any)?.label || (s as any)?.query || (typeof s==='string'? s : '') }));
        appendAssistant(reply, metaPayload);
      },
      pushUser: appendUser,
      callTool: async (tool, payload) => {
        if (tool === 'transactions.nl') {
          return callTransactionsNl(payload);
        }
        throw new Error(`Unsupported chat tool: ${tool}`);
      },
    });
  }, [appendAssistant, appendUser, callTransactionsNl]);

  // Legacy inline submit removed; new SaveRuleModal handles validation + save
  function handleSuggestionChip(chip: { label: string; action: string; source?: string }) {
    const normLabel = chip.label.trim().toLowerCase();
    if (/^save\s+as\s+rule$/.test(normLabel) || /save\s+rule/.test(normLabel)) {
      setSaveRuleScenario(lastWhatIfScenarioRef.current || chip.label || '');
      setShowSaveRuleModal(true);
      return;
    }
    const currentMonth = month;
    switch (chip.action) {
      case 'budget_from_forecast':
        startAguiRun('budget', 'Suggest a budget using the forecast', currentMonth);
        break;
      case 'compare_prev':
        startAguiRun('overview', 'Compare this month’s forecast with last month', currentMonth);
        break;
      case 'apply_budget':
        startAguiRun('budget', 'Apply this what-if scenario to my budget', currentMonth);
        break;
      case 'save_rule':
        setSaveRuleScenario(lastWhatIfScenarioRef.current || chip.label || '');
        setShowSaveRuleModal(true);
        break;
      default:
        // Fallback: just re-run with the chip label as a query
        startAguiRun('overview', chip.label, currentMonth);
    }
  }

  const runAnalyticsWhatIf = React.useCallback(async () => {
    if (busy) return;
    const cat = window.prompt('Category to cut? e.g., "Dining out"', 'Dining out');
    if (!cat) return;
    const pctStr = window.prompt('Cut percent (0-100)', '20');
    const pct = Math.max(0, Math.min(100, Number(pctStr || 0)));
  // what-if not a dedicated branch; legacy path (could map to overview)
    setBusy(true);
    try {
      appendUser(`What if I cut ${cat} by ${pct}%?`);
      await runToolWithRephrase(
        'analytics.whatif',
        () => analytics.whatif({ month, cuts: [{ category: cat, pct }]}),
        (raw: any) => `Explain this what-if simulation for ${month} (cut ${cat} by ${pct}%):\n\n${JSON.stringify(raw)}`,
        (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
        (on) => setBusy(on),
        () => ({ context: getContext(), ...(selectedModel ? { model: selectedModel } : {}) })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant, selectedModel]);

  const runAlerts = React.useCallback(async (ev?: React.MouseEvent) => {
    if (busy) return;
  if (startAguiRun('alerts', AGUI_ACTIONS['alerts'].prompt, month)) return;
    setBusy(true);
    try {
      appendUser('Show my alerts.');
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: 'List my alerts for the selected month.' }],
        intent: 'general',
        context: getContext(ev),
        ...(selectedModel ? { model: selectedModel } : {})
      };
  console.debug('[chat] alerts -> /agent/chat', { preview: req.messages[0]?.content?.slice(0, 80) });
  const resp = await agentChat(req);
  console.debug('[chat] alerts ← ok', { model: resp?.model });
      handleAgentResponse(resp);
    } finally { setBusy(false); }
  }, [busy, selectedModel, handleAgentResponse]);

  // Removed legacy non-NL search tool in favor of NL query

  // (inline quick tool buttons removed; using top-bar runners instead)

  // Auto-run on month change with debouncing and in-flight protection
  useEffect(() => {
    // Skip legacy auto-run when legacy form is disabled
    if (!ENABLE_LEGACY_TOOL_FORM) return;
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
  setLastRunForTool((prev: Record<string, string | undefined>) => ({ ...prev, [tool]: month }));
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

  // Unified right/bottom anchored drag (used by bubble and panel header)
  const startDragRB = React.useCallback((e: React.PointerEvent, w: number, h: number, onClick?: () => void) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { ...rb };
    let moved = false;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      const next = { right: start.right - dx, bottom: start.bottom - dy };
      setRb(clampRB(next, w, h));
    };
    const onUp = (_ev: PointerEvent) => {
      el.releasePointerCapture?.(e.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!moved && onClick) onClick();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [rb]);

  const bubbleEl = (
    <button
      type="button"
      className="fixed z-[80] rounded-full shadow-lg bg-black text-white w-12 h-12 flex items-center justify-center hover:opacity-90 select-none"
      style={{ right: rb.right, bottom: rb.bottom, cursor: "grab", position: 'fixed' as const }}
      data-chatdock-root
      data-chatdock-bubble
      onPointerDown={(e) => startDragRB(e, BUBBLE, BUBBLE)}
      onClick={() => setOpen(true)}
      title="Open Agent Tools (Ctrl+Shift+K)"
    >
      <span className="text-base" aria-hidden>💬</span>
      <span className="sr-only">Open agent chat</span>
    </button>
  );

  const panelEl = open && (
    <div
      ref={panelRef}
  className="fixed z-[70] w-[min(760px,calc(100vw-2rem))] max-h-[80vh] rounded-2xl border border-neutral-700 shadow-xl bg-neutral-900/95 backdrop-blur p-4 flex flex-col min-h-[320px]"
  style={{ right: rb.right, bottom: rb.bottom, position: 'fixed' as const }}
  data-chatdock-root
    >
  <style>{`.intent-badge{display:inline-flex;align-items:center;gap:.35rem;padding:.15rem .45rem;border-radius:9999px;border:1px solid rgba(120,120,120,.35);font-size:.6rem;letter-spacing:.5px;text-transform:uppercase;background:rgba(255,255,255,0.06);} .chip{display:inline-flex;align-items:center;padding:.25rem .6rem;border-radius:9999px;border:1px solid rgba(120,120,120,.35);font-size:.7rem;line-height:1;font-weight:500;cursor:pointer;user-select:none} .chip-suggest{background:rgba(59,130,246,.10);} .chip-suggest-gw{background:rgba(16,185,129,.12);} .chip:focus{outline:2px solid currentColor;outline-offset:1px}`}</style>
      <div
        className="flex items-center justify-between mb-2 select-none border-b border-border pb-1"
        style={{ cursor: "grab" }}
        onPointerDown={(e) => {
          const rect = panelRef.current?.getBoundingClientRect();
          const w = rect?.width ?? PANEL_W_GUESS;
          const h = rect?.height ?? PANEL_H_GUESS;
          startDragRB(e, w, h);
        }}
      >
        <div className="flex items-center gap-2">
          <div className="text-sm text-neutral-300">Agent Tools</div>
          {restoredVisible && <RestoredBadge />}
        </div>
  <div className="flex items-center gap-2">
          {/* Export */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation();
              const normalized = (uiMessages || []).map(m => ({ role: m.role, content: m.text, createdAt: m.ts }));
              const firstUser = (uiMessages || []).find(m => m.role === 'user');
              const trimmed = (firstUser?.text || '').split('\n')[0].slice(0, 40).trim();
              const title = trimmed ? `finance-agent-chat-${trimmed.replace(/\s+/g, '_')}` : 'finance-agent-chat';
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
              const normalized = (uiMessages || []).map(m => ({ role: m.role, content: m.text, createdAt: m.ts }));
              const firstUser = (uiMessages || []).find(m => m.role === 'user');
              const trimmed = (firstUser?.text || '').split('\n')[0].slice(0, 40).trim();
              const title = trimmed ? `finance-agent-chat-${trimmed.replace(/\s+/g, '_')}` : 'finance-agent-chat';
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
            onClick={(e) => { e.stopPropagation(); setRb({ right: MARGIN, bottom: MARGIN }); }}
            className="text-xs px-2 py-1 border rounded-md hover:bg-muted"
            title="Reset to bottom-right"
          >
            Reset
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); handleClearHistory(); }}
            className="text-xs px-2 py-1 border rounded-md hover:bg-muted"
            title="Clear chat history (all tabs)"
          >
            Clear
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
              onClick={(e) => { e.stopPropagation(); setShowAdvanced((v: boolean)=>!v); }}
              className="px-2 py-1 rounded-lg bg-neutral-800 text-neutral-200 border border-neutral-700 hover:bg-neutral-700"
        title="Models"
            >
        {showAdvanced ? 'Hide models' : 'Models'}
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
              <option value="">{`Default - ${modelsInfo.provider}: ${modelsInfo.default}`}</option>
              {modelsInfo.models?.map((m: any) => (
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
            {/* Analytics quick buttons */}
            <button type="button" onClick={(e) => runAnalyticsKpis(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">KPIs</button>
            <button type="button" onClick={(e) => { if(!busy){ startAguiRun('forecast', 'Forecast next month’s spending.', month); } }} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Forecast</button>
            <button type="button" onClick={(e) => runAnalyticsAnomalies(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Anomalies</button>
            <button type="button" onClick={(e) => runAnalyticsRecurring(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Recurring</button>
            <button type="button" onClick={(e) => runAnalyticsBudgetSuggest(e as any)} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">Budget suggest</button>
            <button type="button" onClick={() => runAnalyticsWhatIf()} disabled={busy} className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50">What if...</button>
            {/* Legacy non-NL search removed */}
            <button
              type="button"
              onClick={() => { void handleTransactionsNL(); }}
              disabled={busy}
              className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
              title="Search transactions (NL) — Try: “Starbucks this month”, “Delta in Aug 2025”, “transactions > $50 last 90 days”. Pro tips: MTD, YTD, last N days/weeks/months, since YYYY-MM-DD."
            >
              Search transactions (NL)
            </button>
            <button
              type="button"
              onClick={async () => {
                if (busy) return;
                try {
                  setBusy(true);
                  const last = lastNlqRef.current;
                  if (!last) {
                    window.alert("No previous NL query found. Run a query first.");
                    return;
                  }
                  const { q, flow, filters } = last;
                  const { blob, filename } = await txnsQueryCsv(q, {
                    start: filters?.start,
                    end: filters?.end,
                    page_size: Math.max(100, Math.min(1000, filters?.page_size || filters?.limit || 200)),
                    ...(flow ? { flow } as any : {})
                  });
                  saveAs(blob, filename || "txns_query.csv");
                 
                  appendAssistant(`Exported CSV for last NL query: ${q}`);
                } catch (err: any) {
                  appendAssistant(`**CSV export failed:** ${err?.message || String(err)}`);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
              className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
              title="Download CSV of the last NL transactions query"
            >
              Export CSV (last NL query)
            </button>
            {/* Prev/Next paging for last NL list results */}
            <button
              type="button"
              onClick={async () => {
                if (busy) return;
                const last = lastNlqRef.current;
                if (!last) { window.alert("No previous NL query found."); return; }
                if ((last.intent || '').toLowerCase() !== 'list') { window.alert("Paging applies to list results only."); return; }
                const page = Math.max(1, Number(last.filters?.page || 1) - 1);
                const page_size = Number(last.filters?.page_size || 50);
                await runToolWithRephrase(
                  'transactions.nl_page_prev',
                  async () => {
                    const res = await txnsQuery(last.q, {
                      start: last.filters?.start,
                      end: last.filters?.end,
                      page, page_size,
                      ...(last.flow ? { flow: last.flow as any } : {}),
                    });
                    lastNlqRef.current = {
                      q: last.q,
                      flow: last.flow,
                      filters: (res as any)?.filters ?? { ...(last.filters || {}), page, page_size },
                      intent: (res as any)?.intent,
                    };
                    return res as any;
                  },
                  (res: any) => formatTxnQueryResult(last.q, res),
                  (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
                  (on) => setBusy(on)
                );
              }}
              disabled={busy || !lastNlqRef.current || (lastNlqRef.current?.intent || '').toLowerCase() !== 'list' || Number((lastNlqRef.current?.filters || {}).page || 1) <= 1}
              className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
              title="Previous page of last NL list"
            >
              ◀ Prev page (NL)
            </button>
            <button
              type="button"
              onClick={async () => {
                if (busy) return;
                const last = lastNlqRef.current;
                if (!last) { window.alert("No previous NL query found."); return; }
                if ((last.intent || '').toLowerCase() !== 'list') { window.alert("Paging applies to list results only."); return; }
                const page = Math.max(1, Number(last.filters?.page || 1) + 1);
                const page_size = Number(last.filters?.page_size || 50);
                await runToolWithRephrase(
                  'transactions.nl_page_next',
                  async () => {
                    const res = await txnsQuery(last.q, {
                      start: last.filters?.start,
                      end: last.filters?.end,
                      page, page_size,
                      ...(last.flow ? { flow: last.flow as any } : {}),
                    });
                    lastNlqRef.current = {
                      q: last.q,
                      flow: last.flow,
                      filters: (res as any)?.filters ?? { ...(last.filters || {}), page, page_size },
                      intent: (res as any)?.intent,
                    };
                    return res as any;
                  },
                  (res: any) => formatTxnQueryResult(last.q, res),
                  (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
                  (on) => setBusy(on)
                );
              }}
              disabled={busy || !lastNlqRef.current || (lastNlqRef.current?.intent || '').toLowerCase() !== 'list'}
              className="text-xs px-2 py-1 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50"
              title="Next page of last NL list"
            >
              Next page (NL) ▶
            </button>
            {/* Selftest button removed */}
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
            <div className="text-xs opacity-70">This tab's recent messages</div>
            <button
              className="text-xs px-2 py-1 border rounded-md hover:bg-muted"
              onClick={handleClearHistory}
              title="Clear chat history (all tabs)"
            >
              Clear
            </button>
          </div>
          <div className="max-h-48 overflow-auto space-y-2 text-sm">
            {uiMessages.length === 0 ? (
              <div className="opacity-60 text-xs">No messages yet.</div>
            ) : uiMessages.slice(-50).map((m, i) => (
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

      {/* Messages list (scrollable) with day dividers & timestamps */}
      {aguiRunActive || aguiTools.length ? (
        <div className={["px-3", aguiRunActive ? "" : "agui-ribbon-fade"].join(" ")}> 
          <div className="agui-ribbon">
            {aguiTools.map(t => {
              const baseClass = t.status === 'active' ? 'agui-chip-active' : t.status === 'done' ? 'agui-chip-done' : t.status === 'error' ? 'agui-chip-error' : 'agui-chip-pending';
              return (
                <span key={t.name} className={baseClass} title={t.status}>
                  {t.status === 'active' && <span className="agui-dot agui-dot-pulse" />}
                  {t.status !== 'active' && <span className="agui-dot" />}
                  {t.name.replace('charts.', 'charts/').replace('analytics.', 'analytics/').replace('agent.', 'agent/')}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="flex-1 overflow-auto chat-scroll" ref={listRef}>
        {renderedMessages}
        {busy && (
          <div className="px-3 py-2">
            <RobotThinking size={64} />
          </div>
        )}
        <div id="chatdock-scroll-anchor" ref={bottomRef} />
      </div>

  {/* Undo Snackbar (fixed) stays as-is */}
      {undoVisible && (
        <div
          className={[
            "fixed bottom-4 right-4 z-50",
            "card bg-card border border-border rounded-2xl shadow-lg",
            "px-3 py-2 text-sm flex items-center gap-3",
            undoClosing ? "animate-fade-slide-up" : ""
          ].join(" ")}
          role="status"
          aria-live="polite"
        >
          <span className="opacity-85">{undoMsg}</span>
          <button
            className="px-2 py-1 text-xs rounded-lg border border-border hover:opacity-90"
            onClick={() => {
              if (undoActionRef.current) {
                undoActionRef.current();
              } else {
                // graceful dismiss if no action wired
                setUndoClosing(true);
                window.setTimeout(() => setUndoVisible(false), 800);
              }
            }}
          >
            Undo
          </button>
        </div>
      )}

      <SaveRuleModal
        open={showSaveRuleModal}
        onOpenChange={setShowSaveRuleModal}
        month={month}
        scenario={saveRuleScenario}
        defaultCategory={(() => {
          // Heuristic: attempt to extract category in quotes from scenario text e.g. "Dining out"
          const src = saveRuleScenario || '';
            const q = src.match(/\"([^\"]{2,40})\"/);
            if (q) return q[1];
            // fallback: look for single word after 'cut' or 'reduce'
            const m = src.match(/(?:cut|reduce)\s+([A-Za-z][A-Za-z\s]{2,30})/i);
            if (m) return m[1].trim();
            return '';
        })()}
      />

      <button
        type="button"
        aria-label="Open save rule modal"
        className="fixed bottom-4 left-4 z-40 px-3 py-2 text-xs rounded-md border bg-background/80 backdrop-blur hover:bg-background"
        onClick={() => {
          setSaveRuleScenario(lastWhatIfScenarioRef.current || '');
          setShowSaveRuleModal(true);
        }}
      >
        Save Rule…
      </button>

      {/* Composer - textarea with Enter to send, Shift+Enter newline */}
      <div className="p-3 border-t bg-background sticky bottom-0 z-10 flex items-end gap-2">
        <textarea
          id="chat-composer"
          ref={composerRef}
          rows={1}
          placeholder={composerPlaceholder}
          className="flex-1 resize-none px-3 py-2 rounded-md border bg-background text-sm"
          value={input}
          onChange={(e) => {
            if (composerPlaceholder !== DEFAULT_PLACEHOLDER) {
              setComposerPlaceholderUI(DEFAULT_PLACEHOLDER);
            }
            setInput(e.target.value);
          }}
          onKeyDown={onComposerKeyDown}
          disabled={busy}
        />
        <button
          className="btn hover:bg-muted disabled:opacity-50"
          disabled={!input.trim() || busy}
          onClick={(e) => handleSend(e)}
          title="Send (Enter). Shift+Enter = newline. Hold Alt to omit context."
        >
          {busy ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );

  // Render via portal; show bubble when closed, panel when open
  // Render only the primary instance
  if (!isPrimary) return null;
  return createPortal(<>{open ? panelEl : bubbleEl}</>, document.body);
}

// Helper: format NL transaction query result for chat rendering
// --- helper to inject a compact table (markdown + inline HTML for buttons)
function tableForListWithExplain(rows: any[]): string {
  if (!rows?.length) return "_No matches - try a narrower range or a specific merchant (e.g., `Starbucks last month`)._";
  const head = `| Date | Merchant | Category | Amount | Action |\n|---|---|---|---:|---|`;
  const body = rows.map((r: any) => {
    const amt = `$${Math.abs(Number(r.amount || 0)).toFixed(2)}`;
    const btn = `<button data-explain-id="${r.id}" class="px-2 py-1 rounded-md border border-border">Explain</button>`;
    return `| ${r.date ?? ""} | ${r.merchant ?? ""} | ${r.category ?? ""} | ${amt} | ${btn} |`;
  }).join("\n");
  return `${head}\n${body}`;
}

function hintsBlock(hints?: string[]): string {
  if (!hints?.length) return "";
  const items = hints.map((h) => `- \`${h}\``).join("\n");
  return `> **Try:**\n${items}\n`;
}

function formatTxnQueryResult(q: string, res: TxnQueryResult & { meta?: any }): string {
  const meta = (res as any)?.meta || {};
  const f: any = (res as any).filters || {};
  const windowStr = f.start && f.end ? `\n- Range: ${f.start} -> ${f.end}` : "";
  const hintStr = hintsBlock(meta?.hints);
  const metaMessage = typeof meta?.message === 'string' && meta.message.trim().length ? `${meta.message.trim()}\n\n` : '';
  if (res.intent === "sum") {
    return `${metaMessage}**NL Query:** ${q}${windowStr}\n**Total (abs):** $${res.result.total_abs.toFixed(2)}\n${hintStr}`;
  }
  if (res.intent === "count") {
    return `${metaMessage}**NL Query:** ${q}${windowStr}\n**Count:** ${res.result.count}\n${hintStr}`;
  }
  if (res.intent === "top_merchants") {
    const lines = res.result.map((r, i) => `${i + 1}. ${r.merchant ?? "(Unknown)"} - $${r.spend.toFixed(2)}`).join("\n");
    return `${metaMessage}**NL Query:** ${q}${windowStr}\n**Top merchants:**\n${lines}\n${hintStr}`;
  }
  if (res.intent === "top_categories") {
    const lines = res.result.map((r, i) => `${i + 1}. ${r.category ?? "(Uncategorized)"} - $${r.spend.toFixed(2)}`).join("\n");
    return `${metaMessage}**NL Query:** ${q}${windowStr}\n**Top categories:**\n${lines}\n${hintStr}`;
  }
  if (res.intent === "average") {
    return `${metaMessage}**NL Query:** ${q}${windowStr}\n**Average (abs):** $${res.result.average_abs.toFixed(2)}\n${hintStr}`;
  }
  if (res.intent === "by_day" || res.intent === "by_week" || res.intent === "by_month") {
    const label = res.intent.replace("by_", "By ");
    const lines = (res.result as any[]).map((p: any) => `- ${p.bucket}: $${Number(p.spend || 0).toFixed(2)}`).join("\n");
    return `${metaMessage}**NL Query:** ${q}${windowStr}\n**${label}:**\n${lines}\n${hintStr}`;
  }
  const items = Array.isArray((res as any).result) ? (res as any).result : [];
  const table = tableForListWithExplain(items);
  return `${metaMessage}**NL Query:** ${q}${windowStr}\n${table}\n\n_Use "Export CSV (NL Result)" in tools to download rows._\n${hintStr}`;
}

// Small UI chip to show grounded mode/args (e.g., Forecast horizon)
export function ModeChip({ mode, args }: { mode?: string; args?: any }) {
  if (!mode) return null;
  const norm = String(mode);
  const pretty = (() => {
    if (norm === "analytics.forecast") {
      const h = Math.max(1, Math.min(12, Number(args?.horizon || 3)));
      return `Analytics | Forecast (${h}m)`;
    }
    if (norm === "analytics.kpis") return "Analytics | KPIs";
    if (norm === "analytics.anomalies") return "Analytics | Anomalies";
    if (norm === "analytics.recurring") return "Analytics | Recurring";
    if (norm === "analytics.subscriptions") return "Analytics | Subscriptions";
    if (norm === "analytics.budget_suggest") return "Analytics | Budget suggest";
    if (norm === "analytics.whatif") return "Analytics | What-if";
    if (norm === "charts.summary") return "Charts | Summary";
    if (norm === "charts.flows") return "Charts | Flows";
    if (norm === "charts.merchants") return "Charts | Merchants";
    if (norm === "charts.categories") return "Charts | Categories";
    if (norm === "charts.category") return "Charts | Category";
    if (norm === "nl_txns") return "Transactions | NL";
    if (norm === "budgets.recommendations") return "Budgets | Recommendations";
    if (norm === "budgets.temp") return "Budgets | Temp";
    if (norm === "report.link") return "Report | Link";
    if (norm === "insights.anomalies") return "Insights | Anomalies";
    if (norm === "insights.anomalies.ignore") return "Insights | Ignore anomalies";
    return norm
      .replace("analytics.", "Analytics | ")
      .replace("charts.", "Charts | ")
      .replace("insights.", "Insights | ")
      .replace("budgets.", "Budgets | ")
      .replace("report.", "Report | ")
      .replace("_", " ");
  })();
  return (
    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-neutral-800/70 text-foreground/80 border border-neutral-700">
      {pretty}
    </span>
  );
}

export function ForecastFollowUps({ month, append, setThinking }: { month?: string; append: (msg: string, meta?: any) => void; setThinking: (b: boolean) => void; }) {
  if (!month) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        className="text-xs px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800"
        onClick={() => runAndRephrase(
          "analytics.forecast",
          async () => analytics.forecast(month, 6, { model: "auto", ciLevel: 0.8 }),
          () => "Extend forecast to 6 months.",
          (msg, meta) => append(msg, meta),
          setThinking,
          () => ({})
        )}
      >Extend to 6 months</button>
      <button
        className="text-xs px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800"
        onClick={() => runAndRephrase(
          "analytics.anomalies",
          async () => analytics.anomalies(month, 6),
          () => "Check anomalies for this month.",
          (msg, meta) => append(msg, meta),
          setThinking,
          () => ({})
        )}
      >Check anomalies</button>
      <button
        className="text-xs px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-800"
        onClick={() => runAndRephrase(
          "analytics.budget_suggest",
          async () => analytics.budgetSuggest(month, 6),
          () => "Draft budget suggestions (p75).",
          (msg, meta) => append(msg, meta),
          setThinking,
          () => ({})
        )}
      >Draft budget (p75)</button>
    </div>
  );
}
