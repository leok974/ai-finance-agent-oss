import * as React from "react";
import { createPortal } from "react-dom";
import { stripToolNamespaces } from "@/utils/prettyToolName";
import SaveRuleModal from '@/components/SaveRuleModal';
const { useEffect, useRef, useState, useMemo, useCallback } = React;
import { cn } from "@/lib/utils";
import { wireAguiStream } from "@/lib/aguiStream";
import RobotThinking from "@/components/ui/RobotThinking";
import EnvAvatar from "@/components/EnvAvatar";
import { useAuth, getUserInitial } from "@/state/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSafePortalReady } from "@/hooks/useSafePortal";
import { ChevronUp, ChevronDown, Wrench, Sparkles, TrendingUp, Bell, Repeat, Search, Wallet, MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { agentTools, agentChat, type AgentChatRequest, type AgentChatResponse, type TxnQueryResult, explainTxnForChat, agentRephrase, analytics, transactionsNl, txnsQueryCsv, txnsQuery, agentStatus, type AgentStatusResponse } from "../lib/api";
import { fmtMonthSummary, fmtTopMerchants, fmtCashflow, fmtTrends } from "../lib/formatters";
import { renderQuick, renderDeep, type MonthSummary as FinanceMonthSummary } from "../lib/formatters/finance";
import { adaptChartsSummaryToMonthSummary } from "../lib/formatters/financeAdapters";
import { runToolWithRephrase } from "../lib/tools-runner";
import { MessageRenderer } from "@/features/chat/MessageRenderer";
import { normalizeAssistantReply } from "@/features/chat/normalizeReply";
import { saveAs } from "../utils/save";
import { buildAgentGreeting, buildGreetingCtxFromAPI, type AgentGreetingCtx } from "@/lib/agent/greeting";
import type { MonthSummary, MerchantsResponse } from "@/lib/api.types";
// import { useOkErrToast } from "../lib/toast-helpers";
import RestoredBadge from "./RestoredBadge";
import Markdown from "./Markdown";
import type { ToolKey, ToolSpec, ToolRunState } from "../types/agentTools";
import ErrorBoundary from "./ErrorBoundary";
import { QuickChips, type ChipAction } from "./QuickChips";
import { useMonth } from "../context/MonthContext";
import { useChatDock } from "../context/ChatDockContext";
import { exportThreadAsJSON, exportThreadAsMarkdown } from "../utils/chatExport";
import { chatStore, type BasicMsg, snapshot as chatSnapshot, restoreFromSnapshot as chatRestoreFromSnapshot, discardSnapshot as chatDiscardSnapshot } from "../utils/chatStore";
import runAndRephrase from "./agent-tools/runAndRephrase";
import { registerChatHandlers } from "@/state/chat";
import { DEFAULT_PLACEHOLDER, focusComposer, registerComposerControls, setComposer, setComposerPlaceholder as setComposerPlaceholderUI } from "@/state/chat/ui";
import {
  getToolsOpen,
  subscribe as subscribeTools,
  toggleTools,
} from '@/state/chat/toolsPanel';
import { handleTransactionsNL } from "./AgentTools";
import FallbackBadge from "./FallbackBadge";
import { useShowDevTools } from "@/state/auth";
import { RagToolChips } from "./RagToolChips";
import { ChatControls, type ChatControlsRef } from "@/features/chat/ChatControls";
import { financeName } from "../utils/filename";
import { detectFinanceReply } from "@/features/chat/exportSmart";
import { useChatSession } from "@/state/chatSession";
import { telemetry, AGENT_TOOL_EVENTS } from "@/lib/telemetry";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// Minimal process env typing for test gating without pulling full @types/node
declare const process: { env?: Record<string,string|undefined> } | undefined;

// OVERLAY KILL-SWITCH: Disable all Radix overlays (Dialog, DropdownMenu, etc.) to isolate React #185
const DISABLE_OVERLAYS = import.meta.env.VITE_DISABLE_OVERLAYS === '1';

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
  { key: "charts.trends",    label: "Charts: Spending Trends", path: "/agent/tools/charts/spending-trends",  examplePayload: { month: undefined, months_back: 6 } },
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

// Diagnostic: catch setState-during-render
function useRenderGuard(name: string) {
  const updating = React.useRef(false);
  if (updating.current) console.warn(`[guard] ${name} setState during render`);
  updating.current = true;
  React.useEffect(() => { updating.current = false; });
}

export default function ChatDock() {
  console.log('[ChatDock] render start');

  useRenderGuard('ChatDock');

  // Γ¢æ∩╕Å CRITICAL: Only allow portal creation after complete page load
  const portalReady = useSafePortalReady();

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
  const [isClosing, setIsClosing] = React.useState<boolean>(false);
  const launcherState = open ? 'open' : 'closed';

  const handleClose = React.useCallback(() => {
    if (!open || isClosing) return;

    setIsClosing(true);
    setTimeout(() => {
      setOpen(false);
      setIsClosing(false);
    }, 220); // 200ms transform + 20ms buffer
  }, [open, isClosing]);

  // --- open / close helpers ------------------------------------
  const reallyClose = useCallback(() => {
    setOpen(false);
    setIsClosing(false);
  }, []);

  const handleOpen = useCallback(() => {
    setIsClosing(false);
    setOpen(true);
  }, []);

  const handleToggle = useCallback(() => {
    if (open) {
      handleClose();
    } else {
      handleOpen();
    }
  }, [open, handleClose, handleOpen]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

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
  // Model selection removed - use Dev menu model override instead
  const [busy, setBusy] = React.useState(false);
  const [chatResp, setChatResp] = React.useState<AgentChatResponse | null>(null);
  const [input, setInput] = useState("");
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [composerPlaceholder, setComposerPlaceholderState] = useState(DEFAULT_PLACEHOLDER);

  // ≡ƒöÉ Refs for click-away detection
  const shellRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Why? modal state
  const [showWhyModal, setShowWhyModal] = useState(false);
  const [whyContent, setWhyContent] = useState<{ explain?: string; sources?: Array<any> }>({});
  // LLM health status
  const [llmStatus, setLlmStatus] = useState<AgentStatusResponse>({ ok: false, llm_ok: false });
  // AGUI streaming run state (moved earlier so handleSend can reference)
  const [aguiTools, setAguiTools] = useState<Array<{ name: string; status: 'pending'|'active'|'done'|'error'; startedAt?: number; endedAt?: number }>>([]);
  const aguiToolsRef = React.useRef<typeof aguiTools>(aguiTools);
  React.useEffect(()=>{ aguiToolsRef.current = aguiTools; }, [aguiTools]);

  // Poll agent status every 30 seconds
  React.useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await agentStatus();
        setLlmStatus(status);
      } catch (_err) {
        // Silently fail - status will remain empty
      }
    };

    fetchStatus(); // Initial fetch
    const interval = setInterval(fetchStatus, 30000); // Poll every 30s

    return () => clearInterval(interval);
  }, []);
  // Track last what-if scenario text for rule saving
  const lastWhatIfScenarioRef = useRef<string>("");
  // Save Rule modal state (new component)
  const [showSaveRuleModal, setShowSaveRuleModal] = useState(false);
  const [saveRuleScenario, setSaveRuleScenario] = useState("");
  // Test-only toggle to expose a deterministic Save Rule button in smoke tests
  const forceSaveRuleButton = typeof window !== 'undefined' && (window as any).__FORCE_SAVE_RULE_BUTTON__ === true;
  // Alias for last what-if scenario (if tracked elsewhere adjust accordingly)
  const lastWhatIfScenario = lastWhatIfScenarioRef.current;
  // Track if a what-if run happened this session
  const hadWhatIfRunRef = useRef(false);
  // Stricter: require a what-if run unless forced by test flag
  const IS_TEST = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';
  const canSaveRule = forceSaveRuleButton || (hadWhatIfRunRef.current && typeof lastWhatIfScenario === 'string' && lastWhatIfScenario.trim().length > 0);
  const [aguiRunActive, setAguiRunActive] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const syncTimerRef = useRef<number | null>(null);
  // Persist the last successful NL query + resolved filters so we can export without re-prompting
  type LastNlq = { q: string; flow?: "expenses"|"income"|"all"; filters?: any; intent?: string };
  const lastNlqRef = useRef<LastNlq | null>(null);
  // Track last month summary for deep-dive follow-up
  const lastMonthSummaryRef = useRef<any>(null);
  // Tools panel visibility (from global store)
  const [showTools, setShowTools] = useState<boolean>(() => getToolsOpen());
  const [activePreset, setActivePreset] = useState<ToolPresetKey>('insights_expanded');
  const [toolPayload, setToolPayload] = useState<string>(() => JSON.stringify(TOOL_PRESETS['insights_expanded'].defaultPayload ?? {}, null, 2));

  // Subscribe to toolsPanel store
  useEffect(() => {
    return subscribeTools(setShowTools);
  }, []);

  // Sync data-tools-open attribute to iframe element for E2E testing
  useEffect(() => {
    const iframe = document.getElementById('lm-chat-iframe') as HTMLIFrameElement | null;
    if (iframe) {
      iframe.dataset.toolsOpen = showTools ? 'true' : 'false';
    }
  }, [showTools]);

  // ML selftest UI removed
  // Undo snackbar (animated) for destructive actions like Clear
  const [undoVisible, setUndoVisible] = React.useState(false);
  const [undoClosing, setUndoClosing] = React.useState(false);
  const [undoMsg, setUndoMsg] = React.useState<string>("Cleared");
  const undoActionRef = React.useRef<null | (() => void)>(null);
  const [restoredVisible, setRestoredVisible] = React.useState(false);

  // Dev tools visibility check (PIN-gated)
  const showDevTools = useShowDevTools();

  // Toast for fallback notifications
  const { toast } = useToast();

  // Insights size toggle state
  const [insightsSize, setInsightsSize] = useState<"compact" | "expanded">("compact");

  // Ref for ChatControls to expose openResetModal
  const chatControlsRef = useRef<ChatControlsRef>(null);

  useEffect(() => {
    return registerComposerControls({
      setValue: (value: string) => setInput(value),
      focus: () => composerRef.current?.focus(),
      setPlaceholder: (value: string) => setComposerPlaceholderState(value),
      getValue: () => composerRef.current?.value ?? "",
    });
  }, [setInput, setComposerPlaceholderState]);

  // Wire up abort callback to ChatControls
  useEffect(() => {
    if (chatControlsRef.current) {
      (chatControlsRef.current as any).abortRequest = () => {
        if (reqRef.current) {
          reqRef.current.abort();
          reqRef.current = null;
        }
      };
    }
  }, []);

  // --- feature flags to forcibly hide legacy UI ---
  const ENABLE_TOPBAR_TOOL_BUTTONS = false;   // keep a single "Agent tools" toggle
  const ENABLE_LEGACY_TOOL_FORM    = false;   // hide Payload/Result/Insert context/Run
  const ENABLE_AGUI = ((): boolean => {
    try { return String(import.meta.env.VITE_ENABLE_AGUI || '').trim() === '1'; } catch { return false; }
  })();   // experimental AGUI integration

  // ≡ƒöÑ FIX: Zustand persist middleware was causing infinite render loop in iframe
  // Use state directly on first render, then subscribe in effect to avoid hydration during render
  const [chatState, setChatState] = React.useState(() => {
    try {
      const state = useChatSession.getState();
      return {
        version: state.version,
        messages: state.messages,
        sessionId: state.sessionId
      };
    } catch {
      return { version: 0, messages: [], sessionId: 'fallback-session' };
    }
  });

  // Subscribe to store changes AFTER initial render
  React.useEffect(() => {
    const unsub = useChatSession.subscribe((state) => {
      setChatState({
        version: state.version,
        messages: state.messages,
        sessionId: state.sessionId
      });
    });
    return unsub;
  }, []);

  const { version, messages: storeMessages, sessionId } = chatState;

  // Request abort controller for canceling in-flight requests
  const reqRef = React.useRef<AbortController | null>(null);

  // Live message stream (render from UI state, persist via chatStore)
  const [uiMessages, setUiMessages] = useState<Msg[]>([]);

  // ≡ƒöÑ NEW: Sync uiMessages from Zustand store messages
  React.useEffect(() => {
    if (!storeMessages || !Array.isArray(storeMessages)) return;

    // Convert Zustand messages to UI message format
    const mapped: Msg[] = storeMessages.map((m: any) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as MsgRole,
      text: String(m.text || m.content || ''),
      ts: Number(m.at || m.ts || m.createdAt) || Date.now(),
      meta: m.meta
    }));

    setUiMessages(mapped);
    console.log('[ChatDock] synced messages from store:', mapped.length);
  }, [storeMessages]);

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

  // ≡ƒöÉ Click-away handler: closes when clicking outside bubble + shell
  useEffect(() => {
    if (!open) return;

    function handleClickAway(event: MouseEvent) {
      const shell = shellRef.current;
      const trigger = triggerRef.current;
      if (!shell) return; // Shell must exist when panel is open
      // Note: trigger may be null when panel is open (bubble not rendered)

      const target = event.target as Node | null;
      if (!target) return;

      // If click is inside shell or bubble (if bubble exists) ΓåÆ do nothing
      if (shell.contains(target) || (trigger && trigger.contains(target))) {
        return;
      }

      // Otherwise: click-away ΓåÆ close
      handleClose();
    }

    window.addEventListener("mousedown", handleClickAway);
    return () => window.removeEventListener("mousedown", handleClickAway);
  }, [open, handleClose]);

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
    } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
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

    // Normalize the reply before appending (strip "Hey", apply templates, add variety)
    const normalized = normalizeAssistantReply(
      { role: 'assistant', text, meta: metaPayload },
      user
    );

    // ≡ƒöÑ Write to Zustand store (primary)
    const state = useChatSession.getState();
    useChatSession.setState({
      messages: [...state.messages, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: normalized.text,
        at: ts,
        meta: metaPayload
      }]
    });

    // Legacy: also write to old chatStore for backwards compat
    chatStore.append({ role: 'assistant', content: normalized.text, createdAt: ts });

    try {
      const provider = metaPayload?.fallback;
      if (provider) {
        telemetry.track('chat_fallback_used', { provider: String(provider) });
      }
    } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
    // Show toast if fallback was active
    if (metaPayload._router_fallback_active === true) {
      try {
        toast({
          title: "Using deterministic fallback",
          description: "The model is warming up or unavailable.",
          variant: "default",
        });
      } catch (_err) { /* Fallback if toast hook unavailable */ }
    }
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
      _router_fallback_active: metaPayload._router_fallback_active,
      explain: metaPayload.explain,
      sources: metaPayload.sources,
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

      // Get user initial for avatar
      const userInitial = getUserInitial(user);
      const userPicture = user?.picture_url || user?.picture;

      out.push(
        <div key={`${m.role}-${ts}-${i}`} className={`px-3 py-2 my-1 flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
          {!isUser && (
            <Avatar className="size-7 shrink-0" data-testid="chat-avatar-assistant">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                LM
              </AvatarFallback>
            </Avatar>
          )}
          <div className={`max-w-[72%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${isUser ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-800 text-slate-100 rounded-bl-sm'}`}>
            {isThinking ? (
              <div className="py-1"><span className="sr-only">Thinking.</span><RobotThinking size={32} /></div>
            ) : (
              m.role === 'assistant' ? <MessageRenderer text={m.text} /> : <>{m.text}</>
            )}
          </div>
          {isUser && (
            <Avatar className="size-7 shrink-0 ring-1 ring-primary/30" data-testid="chat-avatar-me">
              {userPicture && <AvatarImage src={userPicture} alt={user?.name || user?.email || "me"} />}
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {userInitial}
              </AvatarFallback>
            </Avatar>
          )}
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
            {m.role === 'assistant' && meta?.fallback ? (
              <FallbackBadge provider={String(meta.fallback)} />
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
            // Check if "Why?" button should be enabled
            const canShowWhy =
              meta._router_fallback_active === false &&
              meta.mode === "primary" &&
              !!meta.explain;

            // Check for finance-specific chips
            const showDeeperBreakdown = meta.showDeeperBreakdown === true;
            const showFinanceActions = meta.showFinanceActions === true;

            if (!chips.length && !canSaveRule && !canShowWhy && !showDeeperBreakdown && !showFinanceActions) return null;
            return (
              <div className="flex flex-wrap gap-2 mt-2 items-center">
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
                {showDeeperBreakdown && (
                  <button
                    type="button"
                    data-testid="action-chip-deeper-breakdown"
                    aria-label="Deeper breakdown"
                    className="chip chip-suggest-gw"
                    onClick={() => handleSuggestionChip({ label: 'Deeper breakdown', action: 'deeper_breakdown', source: 'finance' })}
                  >
                    Deeper breakdown
                  </button>
                )}
                {showFinanceActions && (
                  <>
                    <button
                      type="button"
                      data-testid="action-chip-categorize-unknowns"
                      aria-label="Categorize unknowns"
                      className="chip chip-suggest-gw"
                      onClick={() => handleSuggestionChip({ label: 'Categorize unknowns', action: 'categorize_unknowns', source: 'finance' })}
                    >
                      Categorize unknowns
                    </button>
                    <button
                      type="button"
                      data-testid="action-chip-show-spikes"
                      aria-label="Show only spikes"
                      className="chip chip-suggest-gw"
                      onClick={() => handleSuggestionChip({ label: 'Show only spikes', action: 'show_spikes', source: 'finance' })}
                    >
                      Show only spikes
                    </button>
                    <button
                      type="button"
                      data-testid="action-chip-top-merchants"
                      aria-label="Top merchants detail"
                      className="chip chip-suggest-gw"
                      onClick={() => handleSuggestionChip({ label: 'Top merchants detail', action: 'top_merchants', source: 'finance' })}
                    >
                      Top merchants detail
                    </button>
                    <button
                      type="button"
                      data-testid="action-chip-budget-check"
                      aria-label="Budget check"
                      className="chip chip-suggest-gw"
                      onClick={() => handleSuggestionChip({ label: 'Budget check', action: 'budget_check', source: 'finance' })}
                    >
                      Budget check
                    </button>
                  </>
                )}
                {canShowWhy && (
                  <button
                    type="button"
                    aria-label="Why? - View explanation"
                    className="chip"
                    onClick={() => {
                      setWhyContent({ explain: meta.explain, sources: meta.sources });
                      setShowWhyModal(true);
                    }}
                    title="View detailed explanation and sources"
                  >
                    Why?
                  </button>
                )}
                {canSaveRule && (
                  <button
                    type="button"
                    aria-label="Save RuleΓÇª"
                    className="chip ml-auto"
                    onClick={() => { setSaveRuleScenario(lastWhatIfScenarioRef.current || ''); setShowSaveRuleModal(true); }}
                  >
                    Save RuleΓÇª
                  </button>
                )}
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

    // ≡ƒöÑ Write to Zustand store (primary)
    const state = useChatSession.getState();
    useChatSession.setState({
      messages: [...state.messages, {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        at: ts
      }]
    });

    // Legacy: also write to old chatStore for backwards compat
    chatStore.append({ role: 'user', content: text, createdAt: ts });

    // If a snapshot exists from a recent Clear, discard it once new chat starts
    try { chatDiscardSnapshot(); } catch { /* ignore */ }
  }, []);

  // (appendAssistant moved above first usage)

  // History toggle (reads directly from messages)
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);

  const mapBasicToMsg = React.useCallback((arr: BasicMsg[]): Msg[] => {
    return (arr || []).map(b => ({ role: (b.role === 'assistant' ? 'assistant' : 'user') as MsgRole, text: String(b.content || ''), ts: Number(b.createdAt) || Date.now() }));
  }, []);

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
  // Model fetching and persistence removed - handled by Dev menu's useDev store

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

  // handle keyboard
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) setOpen(false);
      if (e.key.toLowerCase() === "k" && e.shiftKey && e.ctrlKey) { e.preventDefault(); setOpen((v: boolean) => !v); }
      // Ctrl+Shift+C opens Clear modal
      if (e.key.toLowerCase() === "c" && e.shiftKey && e.ctrlKey) {
        e.preventDefault();
        chatControlsRef.current?.openClearModal();
      }
      // Ctrl+Shift+R opens Reset modal
      if (e.key.toLowerCase() === "r" && e.shiftKey && e.ctrlKey) {
        e.preventDefault();
        chatControlsRef.current?.openResetModal();
      }
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

  // Track if greeting has been seeded
  const hasSeededGreetingRef = React.useRef(false);

  // Seed conversational greeting when chat first opens with empty messages
  // ONE-SHOT: Guard with ref and remove function dependencies to prevent re-render loops
  React.useEffect(() => {
    // Only seed greeting once, when panel first opens with no messages
    if (hasSeededGreetingRef.current || !open || uiMessages.length > 0) return;

    // Mark as seeded immediately to prevent re-entry
    hasSeededGreetingRef.current = true;

    const seedGreeting = async () => {
      try {
        // Fetch quick data snapshot for greeting context
        const [summaryData, merchantsData] = await Promise.allSettled([
          agentTools.chartsSummary({ month: month || '' }).catch(() => null),
          agentTools.chartsMerchants({ month: month || '', limit: 10 }).catch(() => null),
        ]);

        const summary = summaryData.status === 'fulfilled' ? summaryData.value as MonthSummary : undefined;
        const merchants = merchantsData.status === 'fulfilled' ? merchantsData.value as MerchantsResponse : undefined;

        // Build greeting context from typed API responses
        const ctx = buildGreetingCtxFromAPI(summary, merchants);

        const greeting = buildAgentGreeting(ctx);

        // Use microtask to decouple from current render cycle
        queueMicrotask(() => {
          appendAssistant(greeting, {
            kind: "greeting",
            used_data: {
              month: ctx.monthLabel,
              totalOut: ctx.totalOut ?? ctx.totalOutCents,
              topMerchant: ctx.topMerchant,
              merchantsN: ctx.merchantsN,
              anomaliesN: ctx.anomaliesN,
            },
          });
        });
      } catch (_err) {
        // If greeting fails, fall back to simple message
        queueMicrotask(() => {
          appendAssistant("Hey! ≡ƒæï How can I help you with your finances today?", { kind: "greeting" });
        });
      }
    };

    // Small delay to let month context settle
    const timer = setTimeout(seedGreeting, 300);
    return () => clearTimeout(timer);
  }, [open, uiMessages.length]); // Removed: month, appendAssistant - read from closure instead

  // Listen for agent:prefill custom event from CardHelpTooltip
  React.useEffect(() => {
    const handlePrefill = (e: Event) => {
      const customEvent = e as CustomEvent<{ message?: string }>;
      if (customEvent.detail?.message) {
        setInput(customEvent.detail.message);
        setOpen(true);
        // Focus composer after state settles
        setTimeout(() => composerRef.current?.focus(), 100);
      }
    };

    window.addEventListener('agent:prefill', handlePrefill);
    return () => window.removeEventListener('agent:prefill', handlePrefill);
  }, []);

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
          } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
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
  if (resp?.reply) appendAssistant(resp.reply, {
    citations: resp.citations,
    ctxMonth: resp.used_context?.month,
    trace: resp.tool_trace,
    model: resp.model,
    fallback: (resp as any).fallback,
    _router_fallback_active: resp._router_fallback_active,
    explain: resp.explain,
    sources: resp.sources,
    mode: resp.mode,
  });
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
  function aguiLog(evt: string, data: any) { try { console.debug(`[agui] ${evt}`, data); } catch (_err) { /* intentionally empty: swallow to render empty-state */ } }
  const handleSend = React.useCallback(async (ev?: React.MouseEvent | React.KeyboardEvent) => {
    if (busy) return;
    const text = input.trim();
    if (!text) return;

    // Cancel any previous in-flight request
    if (reqRef.current) {
      reqRef.current.abort();
      reqRef.current = null;
    }

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

      // Create abort controller for this request
      reqRef.current = new AbortController();
      const currentReqRef = reqRef.current;

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
        onMeta(meta) {
          const fb = (meta as { fallback?: unknown } | null | undefined)?.fallback;
          if (typeof fb !== 'undefined' && fb !== null) {
            setUiMessages(cur => cur.map((m,i) => {
              const thinking = (m as any).thinking || (m as any).meta?.thinking;
              return (i===cur.length-1 && m.role==='assistant' && thinking)
                ? { ...m, meta: { ...(m.meta||{}), fallback: String(fb), thinking: true } }
                : m;
            }));
          }
        },
        onFinish() {
          const snapshot = aguiToolsRef.current || aguiTools;
          const errors = snapshot.filter(t => t.status === 'error').map(t => t.name);
          if (errors.length) {
            const pretty = errors.map(stripToolNamespaces);
            aggregated += `\n\nΓÜá∩╕Å Skipped: ${pretty.join(', ')} (unavailable). I used everything else.`;
          }
          setBusy(false); setAguiRunActive(false); appendAssistant(aggregated || '(no content)');
          if (reqRef.current === currentReqRef) reqRef.current = null;
        },
        onError() {
          setBusy(false); setAguiRunActive(false); appendAssistant('(stream error ΓÇô fallback)');
          if (reqRef.current === currentReqRef) reqRef.current = null;
        }
      });
      return;
    }
    setInput("");
    setComposerPlaceholderUI(DEFAULT_PLACEHOLDER);
    focusComposer();
    appendUser(text);
    setBusy(true);

    // Create abort controller for this request
    reqRef.current = new AbortController();
    const currentReqRef = reqRef.current;

    try {
      const req: AgentChatRequest = {
        messages: [{ role: 'user', content: text }],
        intent: 'general',
        context: getContext(ev as any),
        conversational: true  // Enable conversational voice styling
      };
      const resp = await agentChat(req);
      handleAgentResponse(resp);
      syncFromStoreDebounced(120);
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        appendAssistant(`Send failed: ${e?.message ?? String(e)}`);
      }
    } finally {
      setBusy(false);
      if (reqRef.current === currentReqRef) reqRef.current = null;
    }
  }, [busy, input, handleAgentResponse, month, appendUser, appendAssistant]);

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
      appendUser('Summarize my spending this month');

      // Fetch data without LLM rephrase
      const data = await agentTools.chartsSummary({ month: month || '', include_daily: false } as any);

      // Transform to MonthSummary format
      const summary = adaptChartsSummaryToMonthSummary(data, month || '');
      lastMonthSummaryRef.current = summary;

      // Render quick recap
      const quickRecap = renderQuick(summary);

      // Add with special meta to show "Deeper breakdown" chip
      appendAssistant(quickRecap, {
        ctxMonth: month,
        mode: 'finance_quick_recap',
        showDeeperBreakdown: true,
        monthSummary: summary, // Store for smart export
      });

      syncFromStoreDebounced(120);
    } catch (err: any) {
      appendAssistant(`Failed to load month summary: ${err?.message || String(err)}`);
    } finally {
      setBusy(false);
    }
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
        () => ({ context: getContext() })
      );
      syncFromStoreDebounced(120);
    } finally {
      setBusy(false);
    }
  }, [busy, month, appendAssistant]);

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
  () => ({ context: getContext() })
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
  () => ({ context: getContext() })
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
  () => ({ context: getContext() })
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

  // Merged Insights function with size parameter
  const runInsights = React.useCallback(async ({ size }: { size: "compact" | "expanded" }) => {
    if (busy) return;
    const aguiAction = size === "compact" ? "insights-summary" : "insights-expanded";
    if (startAguiRun('overview', AGUI_ACTIONS[aguiAction].prompt, month)) return;
    setBusy(true);
    try {
      const userPrompt = size === "compact"
        ? 'Summarize key insights for this month.'
        : 'Expand insights (month-over-month + anomalies).';
      appendUser(userPrompt);

      const rephrasePrompt = size === "compact"
        ? `Turn these insights for ${month} into a friendly paragraph with one recommendation: `
        : `Expand insights for ${month} with MoM and anomalies: `;

      telemetry.track(AGENT_TOOL_EVENTS.INSIGHTS, { size });

      await runToolWithRephrase(
        'insights.expanded',
        () => agentTools.insightsExpanded({ month }),
        (raw) => rephrasePrompt + JSON.stringify(raw),
        (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
        (on) => setBusy(on),
        () => ({ context: getContext() })
      );
      syncFromStore();
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant, insightsSize]);

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
  () => ({ context: getContext() })
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
        () => ({ context: getContext() })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant]);

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
        () => ({ context: getContext() })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant]);

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
        () => ({ context: getContext() })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant]);

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
        () => ({ context: getContext() })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant]);

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
        () => ({ context: getContext() })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant]);

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
    'overview':         { prompt: 'Give me this monthΓÇÖs overview summary.', mode: 'overview' },
    'subscriptions':    { prompt: 'Identify recurring subscriptions this month and suggest which I could cancel.', mode: 'subscriptions' },
    'merchants':        { prompt: 'Show top merchants for the current month.', mode: 'merchants' },
    'cashflow':         { prompt: 'Show my cashflow breakdown for this month.', mode: 'cashflow' },
    'trends':           { prompt: 'Show spending trends for this month versus prior month.', mode: 'overview' },
    'insights-summary': { prompt: 'Summarize key insights for this month.', mode: 'overview' },
    'insights-expanded':{ prompt: 'Give me expanded insights for this month (last 60 days if needed).', mode: 'overview' },
    'budget':           { prompt: 'Check my budget status for this month.', mode: 'budget' },
    'kpis':             { prompt: 'Show KPIs for this month.', mode: 'kpis' },
    'forecast':         { prompt: 'Forecast next monthΓÇÖs spending.', mode: 'forecast' },
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
  if (mode === 'what-if') { lastWhatIfScenarioRef.current = prompt; hadWhatIfRunRef.current = true; }
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
            aggregated += `\n\nΓÜá∩╕Å Skipped: ${pretty.join(', ')} (unavailable). I used everything else.`;
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
  onError() { setBusy(false); setAguiRunActive(false); appendAssistant('(stream error ΓÇô fallback)'); }
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
      case 'deeper_breakdown':
        // Show deep dive for last month summary
        if (lastMonthSummaryRef.current) {
          appendUser('Show deeper breakdown');
          const deepDive = renderDeep(lastMonthSummaryRef.current);
          appendAssistant(deepDive, {
            ctxMonth: currentMonth,
            mode: 'finance_deep_dive',
            showFinanceActions: true,
            monthSummary: lastMonthSummaryRef.current, // Store for smart export
          });
        }
        break;
      case 'categorize_unknowns':
        appendUser(`Categorize unknowns for ${currentMonth}`);
        startAguiRun('overview', `Show me all uncategorized transactions for ${currentMonth} and suggest categories`, currentMonth);
        break;
      case 'show_spikes':
        appendUser(`Show only spikes for ${currentMonth}`);
        startAguiRun('anomalies', `Show unusual spending spikes and large transactions for ${currentMonth}`, currentMonth);
        break;
      case 'top_merchants':
        appendUser(`Top merchants detail for ${currentMonth}`);
        startAguiRun('merchants', `Show top merchants for ${currentMonth} with spending breakdown`, currentMonth);
        break;
      case 'budget_check':
        appendUser(`Budget check for ${currentMonth}`);
        startAguiRun('budget', `Check my budget status for ${currentMonth}`, currentMonth);
        break;
      case 'budget_from_forecast':
        startAguiRun('budget', 'Suggest a budget using the forecast', currentMonth);
        break;
      case 'compare_prev':
        startAguiRun('overview', 'Compare this monthΓÇÖs forecast with last month', currentMonth);
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
        () => analytics.whatif({ month, cuts: [{ category: cat, pct }] }),
        (raw: any) => `Explain this what-if simulation for ${month} (cut ${cat} by ${pct}%):\n\n${JSON.stringify(raw)}`,
        (msg, meta) => appendAssistant(msg, { ...meta, ctxMonth: month }),
        (on) => setBusy(on),
        () => ({ context: getContext() })
      );
      syncFromStoreDebounced(120);
    } finally { setBusy(false); }
  }, [busy, month, appendAssistant]);

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
        conversational: true  // Enable conversational voice styling
      };
  console.debug('[chat] alerts -> /agent/chat', { preview: req.messages[0]?.content?.slice(0, 80) });
  const resp = await agentChat(req);
  console.debug('[chat] alerts ΓåÉ ok', { model: resp?.model });
      handleAgentResponse(resp);
    } finally { setBusy(false); }
  }, [busy, handleAgentResponse]);

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

  // Wheel handler: manually drive scrollTop to bypass flex/overflow quirks
  const handleScrollWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      const { scrollHeight, clientHeight, scrollTop } = el;

      // If no vertical overflow, let the page handle the scroll normally
      if (scrollHeight <= clientHeight) {
        return;
      }

      // Apply the wheel delta manually
      el.scrollTop += event.deltaY;

      // If scrollTop actually changed, we consumed the scroll
      if (el.scrollTop !== scrollTop) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    []
  );

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

  const bubbleIcon = (
    <span className="lm-chat-launcher-glyph">LM</span>
  );

  const panel = (
    <Card className="lm-chat-card bg-transparent border-0 shadow-none" data-testid="lm-chat-panel">
      {/* Gradient top: header + sections */}
      <div
        className="lm-chat-gradient"
        data-testid="lm-chat-scroll"
        onWheel={handleScrollWheel}
      >
        <CardHeader className="lm-chat-header">
          <div className="lm-chat-header-main">
            <CardTitle className="lm-chat-title">LEDGERMIND ASSISTANT</CardTitle>
            {llmStatus.llm_ok !== undefined && (
              <Badge variant="outline" className="lm-chat-badge">
                <span className="dot" /> {llmStatus.llm_ok ? 'LLM: OK' : 'LLM: Fallback'}
              </Badge>
            )}
          </div>
          <div className="lm-chat-header-actions">
            <Button
              variant="pill-ghost"
              size="sm"
              className="lm-chat-chip"
              data-testid="agent-tool-export-json"
              onClick={(e) => {
                e.stopPropagation();
                const sessionId = useChatSession.getState().sessionId;
                const financePayload = detectFinanceReply(uiMessages, sessionId);
                telemetry.track(AGENT_TOOL_EVENTS.EXPORT_JSON, { mode: financePayload ? 'finance' : 'thread' });
                if (financePayload) {
                  const month = financePayload.month;
                  const kind = financePayload.kind === 'finance_quick_recap' ? 'quick' : 'deep';
                  const filename = financeName(month, kind);
                  const blob = new Blob([JSON.stringify(financePayload, null, 2)], { type: 'application/json' });
                  saveAs(blob, filename);
                } else {
                  const normalized = (uiMessages || []).map(m => ({ role: m.role, content: m.text, createdAt: m.ts }));
                  const firstUser = (uiMessages || []).find(m => m.role === 'user');
                  const trimmed = (firstUser?.text || '').split('\n')[0].slice(0, 40).trim();
                  const title = trimmed ? `finance-agent-chat-${trimmed.replace(/\s+/g, '_')}` : 'finance-agent-chat';
                  exportThreadAsJSON(title, normalized);
                }
              }}
              disabled={!uiMessages || uiMessages.length === 0}
              title="Export last finance summary (if present) or full thread"
            >
              Export JSON
            </Button>
            <Button
              variant="pill-ghost"
              size="sm"
              className="lm-chat-chip"
              data-testid="agent-tool-export-markdown"
              onClick={(e) => {
                e.stopPropagation();
                const lastAssistant = [...(uiMessages || [])].reverse().find(m => m.role === 'assistant');
                const isFinanceSummary = lastAssistant?.meta?.mode === 'finance_quick_recap' || lastAssistant?.meta?.mode === 'finance_deep_dive';
                telemetry.track(AGENT_TOOL_EVENTS.EXPORT_MARKDOWN, { mode: isFinanceSummary ? 'finance' : 'thread' });
                if (isFinanceSummary && lastAssistant) {
                  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                  const month = lastAssistant.meta?.ctxMonth || 'unknown';
                  const filename = `finance-summary-${month}-${timestamp}.md`;
                  const blob = new Blob([lastAssistant.text], { type: 'text/markdown;charset=utf-8' });
                  saveAs(blob, filename);
                } else {
                  const normalized = (uiMessages || []).map(m => ({ role: m.role, content: m.text, createdAt: m.ts }));
                  const firstUser = (uiMessages || []).find(m => m.role === 'user');
                  const trimmed = (firstUser?.text || '').split('\n')[0].slice(0, 40).trim();
                  const title = trimmed ? `finance-agent-chat-${trimmed.replace(/\s+/g, '_')}` : 'finance-agent-chat';
                  exportThreadAsMarkdown(title, normalized);
                }
              }}
              title="Export last finance summary (if present) or full thread"
            >
              Export Markdown
            </Button>
            <Button
              variant="pill-ghost"
              size="sm"
              className="lm-chat-chip"
              onClick={() => setShowTools(false)}
              title="Hide tools"
            >
              Hide tools
            </Button>
          </div>
        </CardHeader>

        <CardContent className="lm-chat-body">
          {/* INSIGHTS */}
          <section className="lm-chat-section" data-testid="lm-chat-section-insights">
            <div className="lm-chat-section-header">
              <span className="lm-chat-section-label">INSIGHTS</span>
            </div>
            <div className="lm-chat-tools-grid">
              <Button
                variant="pill-outline"
                size="sm"
                className="lm-chat-tool"
                onClick={(e) => { telemetry.track(AGENT_TOOL_EVENTS.MONTH_SUMMARY); runMonthSummary(e as any); }}
                disabled={busy}
                data-testid="agent-tool-month-summary"
              >
                <Sparkles className="lm-chat-tool-icon" />
                <span>Month summary</span>
              </Button>
              <Button
                variant="pill-outline"
                size="sm"
                className="lm-chat-tool"
                onClick={(e) => { telemetry.track(AGENT_TOOL_EVENTS.TRENDS); runTrends(e as any); }}
                disabled={busy}
                data-testid="agent-tool-trends"
              >
                <TrendingUp className="lm-chat-tool-icon" />
                <span>Trends</span>
              </Button>
              <Button
                variant="pill-outline"
                size="sm"
                className="lm-chat-tool"
                onClick={(e) => runAlerts(e as any)}
                disabled={busy}
              >
                <Bell className="lm-chat-tool-icon" />
                <span>Alerts</span>
              </Button>
            </div>
          </section>

          {/* SUBSCRIPTIONS */}
          <section className="lm-chat-section" data-testid="lm-chat-section-subscriptions">
            <div className="lm-chat-section-header">
              <span className="lm-chat-section-label">SUBSCRIPTIONS</span>
            </div>
            <div className="lm-chat-tools-grid">
              <Button
                variant="pill-outline"
                size="sm"
                className="lm-chat-tool"
                onClick={(e) => runAnalyticsRecurring(e as any)}
                disabled={busy}
              >
                <Repeat className="lm-chat-tool-icon" />
                <span>Recurring</span>
              </Button>
              <Button
                variant="pill-outline"
                size="sm"
                className="lm-chat-tool"
                onClick={(e) => { telemetry.track(AGENT_TOOL_EVENTS.FIND_SUBSCRIPTIONS); runFindSubscriptions(e as any); }}
                disabled={busy}
                data-testid="agent-tool-find-subscriptions"
              >
                <Search className="lm-chat-tool-icon" />
                <span>Find subscriptions</span>
              </Button>
            </div>
          </section>

          {/* SEARCH & PLANNING */}
          <section className="lm-chat-section" data-testid="lm-chat-section-search">
            <div className="lm-chat-section-header">
              <span className="lm-chat-section-label">SEARCH & PLANNING</span>
            </div>
            <div className="lm-chat-tools-grid">
              <Button
                variant="pill-outline"
                size="sm"
                className="lm-chat-tool"
                onClick={() => { setInsightsSize("compact"); telemetry.track(AGENT_TOOL_EVENTS.INSIGHTS, { size: "compact" }); runInsights({ size: "compact" }); }}
                disabled={busy}
                data-testid="agent-tool-insights-compact"
              >
                <MessageCircle className="lm-chat-tool-icon" />
                <span>Insights (Q)</span>
              </Button>
              <Button
                variant="pill-outline"
                size="sm"
                className="lm-chat-tool"
                onClick={(e) => runAnalyticsBudgetSuggest(e as any)}
                disabled={busy}
              >
                <Wallet className="lm-chat-tool-icon" />
                <span>Budget suggest</span>
              </Button>
              <Button
                variant="pill-outline"
                size="sm"
                className="lm-chat-tool"
                onClick={() => { void handleTransactionsNL(); }}
                disabled={busy}
                title="Search transactions (NL) ΓÇö Try: 'Starbucks this month', 'Delta in Aug 2025', 'transactions > $50 last 90 days'. Pro tips: MTD, YTD, last N days/weeks/months, since YYYY-MM-DD."
              >
                <Search className="lm-chat-tool-icon" />
                <span>Search transactions (NL)</span>
              </Button>
            </div>
          </section>
        </CardContent>
      </div>

      {/* Dark footer */}
      <CardFooter className="lm-chat-footer">
        <div className="lm-chat-footer-inner">
          <div className="lm-chat-greeting">
            <p className="lm-chat-greeting-title">Hey! ≡ƒæï</p>
            <p className="lm-chat-greeting-body">
              Start a conversation or pick a tool from the header to explore your spending.
            </p>
          </div>

          <form className="lm-chat-input-row" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
            <input
              className="lm-chat-input"
              placeholder="Ask or type a command..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
            />
            <Button className="lm-chat-send-button" type="submit" disabled={!input.trim() || busy} size="sm">
              Send
            </Button>
          </form>
        </div>
      </CardFooter>
      </Card>
  );

  // Since we're already mounted in Shadow DOM via chatMount.tsx,
  // just return the content directly instead of creating another root
  if (!portalReady || !isPrimary) return null;

  // --- Shell (backdrop + card) ---------------------------------
  const shell = (
    <div
      data-testid="lm-chat-shell"
      className={cn(
        "lm-chat-shell",
        open && !isClosing && "lm-chat-shell--open",
        isClosing && "lm-chat-shell--closing"
      )}
      // clicking outside the card but inside the shell closes
      onClick={handleClose}
    >
      <div
        data-testid="lm-chat-backdrop"
        className="lm-chat-backdrop"
      />
      <div
        className="lm-chat-shell-inner"
        onClick={(e) => e.stopPropagation()} // keep card clicks from closing
      >
        {panel}
      </div>
    </div>
  );

  // --- Launcher + overlay (portal to <body>) --------------------
  const node = (
    <div
      data-testid="lm-chat-launcher"
      className={cn(
        "lm-chat-launcher",
        open ? "lm-chat-launcher--open" : "lm-chat-launcher--closed"
      )}
      data-state={open ? "open" : "closed"}
    >
      <button
        type="button"
        ref={triggerRef}
        data-testid="lm-chat-launcher-button"
        aria-label={open ? 'Close LedgerMind Assistant' : 'Open LedgerMind Assistant'}
        onClick={handleToggle}
        className="lm-chat-launcher-bubble"
      >
        {bubbleIcon}
      </button>

      {open && (
        <div
          data-testid="lm-chat-overlay"
          className="lm-chat-overlay"
        >
          {shell}
        </div>
      )}
    </div>
  );

  const root = document.body;
  return root ? createPortal(node, root) : null;
}

// Helper: format NL transaction query result for chat rendering

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
