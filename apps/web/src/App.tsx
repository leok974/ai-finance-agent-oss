import React, { useState, useCallback, useEffect, useRef, Suspense, lazy } from "react";
import { MonthContext } from "./context/MonthContext";
import UploadCsv from "./components/UploadCsv";
import UnknownsPanel from "./components/UnknownsPanel";
// import RuleTesterPanel from "./components/RuleTesterPanel"; // rendered only inside DevDock
import { AgentResultRenderer } from "./components/AgentResultRenderers";
import { emitToastSuccess } from "@/lib/toast-helpers";
import { t } from '@/lib/i18n';
// import RulesPanel from "./components/RulesPanel";
import { getAlerts, getMonthSummary, getHealthz, agentTools, fetchLatestMonth } from './lib/api'
import { withAuthGuard, safeFetch } from '@/lib/authGuard';
import { withRetry } from '@/lib/retry';
import { flags } from "@/lib/flags";
import AboutDrawer from './components/AboutDrawer';
import RulesPanel from "./components/RulesPanel";
import ChatDock from "./components/ChatDock";
import { useChatDockStore } from "./stores/chatdock";
import DevDock from "@/components/dev/DevDock";
import PlannerDevPanel from "@/components/dev/PlannerDevPanel";
import RuleTesterPanel from "@/components/RuleTesterPanel";
import { isDevUIEnabled, setDevUIEnabled, useDevUI } from "@/state/useDevUI";
import MLStatusCard from "@/components/MLStatusCard";
import { ChatDockProvider } from "./context/ChatDockContext";
import ChartsPanel from "./components/ChartsPanel";
import TopEmptyBanner from "./components/TopEmptyBanner";
// import MLStatusCard from "./components/MLStatusCard"; // rendered only inside DevDock
import NetActivityBlip from "@/components/NetActivityBlip";
// import LoginForm from "@/components/LoginForm"; // Replaced with AuthMenu for OAuth
import AuthMenu from "@/components/AuthMenu";
import { useAuth, useIsAdmin } from "@/state/auth";
// import { ensureChatMounted } from "@/boot/mountChat"; // Removed: ChatDock now renders directly
import { useChartsStore } from "@/state/charts";
import { initBroadcastChannelSync } from "@/state/chatSession";
// import AgentChat from "./components/AgentChat"; // legacy chat bubble disabled
import { setGlobalMonth } from "./state/month";
// Providers are applied at the top-level (main.tsx)
import InsightsAnomaliesCard from "./components/InsightsAnomaliesCard";
import ErrorBoundary from "@/components/ErrorBoundary";
import HelpMode from "@/components/HelpMode";
import AppHelpMode from "./AppHelpMode";
import HelpExplainListener from "@/components/HelpExplainListener";
import { HelpPanelHost } from "@/features/help/HelpPanel";
import ForecastCard from "@/components/ForecastCard";
import TransactionsDrawer from "@/components/TransactionsDrawer";
import Brand from "@/components/Brand";
import TransactionsButton from "@/components/header/TransactionsButton";
import MonthPicker from "@/components/header/MonthPicker";
import DevMenu from "@/features/dev/DevMenu";
import logoPng from "@/assets/ledgermind-lockup-1024.png";
import { useLlmStore } from '@/state/llmStore';
import { Switch } from "@/components/ui/switch";
import { SettingsDrawer } from "@/components/SettingsDrawer";
import { Label } from "@/components/ui/label";
import LandingHero from "@/components/LandingHero";
import PrivacyPage from "@/pages/legal/PrivacyPage";
import TermsPage from "@/pages/legal/TermsPage";
import SecurityPage from "@/pages/legal/SecurityPage";
import { RuleSeedProvider } from "@/hooks/useRuleSeed";

// Lazy-load admin panels (only load when accessed)
const AdminRulesPanel = React.lazy(() => import("@/components/admin/AdminRulesPanel"));
const AdminKnowledgePanel = React.lazy(() => import("@/components/admin/AdminKnowledgePanel"));
import MerchantHintsPanel from "@/components/MerchantHintsPanel";

// Log frontend version info
console.info("[Web] branch=", __WEB_BRANCH__, "commit=", __WEB_COMMIT__);


const App: React.FC = () => {
  // Chat feature flags with runtime fuse for crash protection
  const qp = new URLSearchParams(window.location.search);
  const CHAT_QP = qp.get('chat');
  console.log('[App] CHAT_QP =', CHAT_QP, 'type=', typeof CHAT_QP);
  // Default: chat ON (can disable with ?chat=0 for debugging)
  // Allow diagnostic modes: ?chat=diag or ?chat=debug
  const CHAT_FLAG = CHAT_QP !== null
    ? CHAT_QP !== '0' // Enable for '1', 'diag', 'debug', or any truthy value
    : true; // Changed from env check - chat ON by default
  console.log('[App] CHAT_FLAG =', CHAT_FLAG);

  // Session-scoped fuse (cleared on browser close, not persistent like localStorage)
  // Allow ?chat=1 query param to force-enable and clear fuse
  if (CHAT_QP === '1') {
    sessionStorage.removeItem('lm:disableChat');
    console.log('[App] chat fuse cleared by ?chat=1 query param');
  }
  const CHAT_FUSE_OFF = sessionStorage.getItem('lm:disableChat') === '1';
  console.log('[App] CHAT_FUSE_OFF =', CHAT_FUSE_OFF);
  const chatEnabled = CHAT_FLAG && !CHAT_FUSE_OFF;
  console.log('[App] chatEnabled =', chatEnabled);

  // Global helper for debugging
  if (typeof window !== 'undefined') {
    (window as any).enableChat = () => {
      sessionStorage.removeItem('lm:disableChat');
      console.log('[App] chat fuse cleared - reload page to enable chat');
      location.reload();
    };
  }

  // Prefetch flag
  const prefetchEnabled =
    (import.meta.env.VITE_PREFETCH_ENABLED ?? '1') === '1' &&
    qp.get('prefetch') !== '0';

  // Deterministic initial state - no localStorage access during render
  const [devDockOpen, setDevDockOpen] = useState<boolean>(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    const viteDevUI = (import.meta as any).env?.VITE_DEV_UI === '1';
    const devDockStored = localStorage.getItem('DEV_DOCK') !== '0';
    setDevDockOpen(viteDevUI || devDockStored);
  }, []);

  const devUI = useDevUI();
  const isAdmin = useIsAdmin();
  const [month, setMonth] = useState<string>("");
  const [ready, setReady] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  // Legacy report removed: using expanded insights and charts exclusively
  const [insights, setInsights] = useState<any>(null)
  const [_alerts, setAlerts] = useState<any>(null)
  const [empty, setEmpty] = useState<boolean>(false)
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false)
  const [txPanelOpen, setTxPanelOpen] = useState<boolean>(false)
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false)
  const [adminRulesOpen, setAdminRulesOpen] = useState<boolean>(false)
  const [adminKnowledgeOpen, setAdminKnowledgeOpen] = useState<boolean>(false)
  const [includePending, setIncludePending] = useState<boolean>(false)
  const booted = useRef(false)
  const [dbRev, setDbRev] = useState<string | null>(null);
  const [inSync, setInSync] = useState<boolean | undefined>(undefined);
  const refetchAllCharts = useChartsStore((state) => state.refetchAll);

  // Keyboard toggles: Ctrl+Alt+D soft session toggle (no reload), Ctrl+Shift+D hard persistent toggle (reload)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      try {
        const keyD = e.key.toLowerCase() === 'd';
        if (!keyD || !e.ctrlKey) return;
        if (e.altKey && !e.shiftKey) {
          // Soft toggle (session only)
          const next = !isDevUIEnabled();
          window.dispatchEvent(new CustomEvent('devui:soft', { detail: { value: next }}));
          window.dispatchEvent(new CustomEvent('devui:changed', { detail: { value: next, soft: true }}));
          try { emitToastSuccess?.(next ? t('ui.toast.dev_ui_soft_on') : t('ui.toast.dev_ui_soft_off')); } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
        } else if (e.shiftKey) {
          // Hard persistent toggle
          const next = !isDevUIEnabled();
          setDevUIEnabled(next);
          try { emitToastSuccess?.(next ? t('ui.toast.dev_ui_enabled') : t('ui.toast.dev_ui_disabled')); } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
          location.reload();
        }
      } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Legacy month initialization via charts retained only as fallback inside fetchLatestMonth (POST now canonical)

  useEffect(() => {
    if (booted.current) return; // guard re-run in dev (StrictMode)
    booted.current = true;
    (async () => {
      // Core readiness gate: fetch /ready (new canonical) to decide whether to defer heavier chart calls
      try {
        const statusResp = await fetch('/ready', { credentials: 'include' });
        if (statusResp.ok) (window as any).__CORE_READY__ = true; else console.warn('[boot] readiness probe not OK');
      } catch (e) {
        console.warn('[boot] status probe failed', e);
      }
      console.info("[boot] resolving month (meta POST)…");
      const m = (await fetchLatestMonth())
        ?? (() => {
             const now = new Date();
             return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
           })();
      console.info("[boot] resolved month =", m);
      setMonth(m);
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { user, authReady, logout } = useAuth();
  const authOk = !!user;

  // Initialize BroadcastChannel for cross-tab chat synchronization (client-side only, auth-gated)
  // TEMPORARILY DISABLED for debugging
  // useEffect(() => {
  //   if (!authOk) return; // Only init when authenticated
  //   initBroadcastChannelSync();
  // }, [authOk]);

  // Load dashboard data whenever month changes (only when authenticated)
  useEffect(() => {
    // CRITICAL: Never make API calls before auth is confirmed + feature flag check
    if (!authReady || !authOk || !ready || !month || !prefetchEnabled) return;
    console.info("[boot] loading dashboards for month", month);
    const coreReady = (window as any).__CORE_READY__ === true;
    if (!coreReady) {
      console.info('[boot] skipping charts prefetch (core not ready)');
      return;
    }
    // Wrap in retry logic for resilience
    const fetchCharts = async () => {
      try {
        await withRetry(() => refetchAllCharts(month), { maxAttempts: 3 });
        console.log('[boot] charts prefetch completed for month:', month);
      } catch (error) {
        console.error('[boot] charts prefetch failed after retries:', error);
      }
    };
    // Also prefetch spending trends separately (not in store yet) - use safeFetch for non-critical
    const fetchTrends = async () => {
      try {
        await safeFetch(
          () => agentTools.chartsSpendingTrends({ month, months_back: 6 }),
          null
        );
      } catch (error) {
        console.warn('[boot] spending trends prefetch failed:', error);
      }
    };
    void fetchCharts();
    void fetchTrends();
  }, [authReady, authOk, ready, month, prefetchEnabled, refetchAllCharts]);

  // Log DB health once after CORS/DB are good (boot complete) and capture db revision
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const h = await getHealthz();
        if (!alive) return;
        const db = h?.db_engine || 'unknown-db';
        const mig = h?.alembic_ok ?? h?.alembic?.in_sync ?? 'unknown';
        // models_ok was formerly supplied by backend; prefer llmStore derived state now
        const llmModelsOk = useLlmStore.getState().modelsOk;
        setDbRev((h as any)?.db_revision ?? (h as any)?.alembic?.db_revision ?? null);
        setInSync((h as any)?.alembic_ok ?? (h as any)?.alembic?.in_sync);
        console.log(`[db] ${db} loaded | alembic_ok=${String(mig)} | models_ok=${String(llmModelsOk)}`);
      } catch (e) {
        console.warn('[db] healthz failed:', e);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load insights and alerts separately for state management
  useEffect(()=>{ (async()=>{
  // CRITICAL: Never make API calls before auth is confirmed
  if (!authReady || !authOk || !ready || !month) return;
    let cancelled = false;
    try {
      // Wrap in retry + auth guard for extra safety
      const status = includePending ? 'all' : 'posted';
      const [insightsData, alertsData] = await Promise.all([
        withRetry(() => withAuthGuard(agentTools.insightsExpanded)({ month, large_limit: 10, status }), { maxAttempts: 2 }).catch(() => null),
        withRetry(() => withAuthGuard(getAlerts)(month), { maxAttempts: 2 }).catch(() => null),
      ]);
      if (cancelled) return;
      // Set benign defaults if tools return null/error
      setInsights(insightsData || null);
      setAlerts(alertsData || null);
    } catch (error) {
      if (cancelled) return;
      console.error('[boot] insights/alerts fetch failed:', error);
      // Set empty states on error to prevent infinite loading
      setInsights(null);
      setAlerts(null);
    }
    return () => { cancelled = true; };
  })() }, [authReady, authOk, ready, month, refreshKey, includePending])

  // Probe backend emptiness (latest by default). If charts summary returns null or month:null, show banner.
  useEffect(() => { (async () => {
  // CRITICAL: Never make API calls before auth is confirmed
  if (!authReady || !authOk || !ready || !month) return;
    try {
      const s = await withRetry(() => withAuthGuard(getMonthSummary)(month), { maxAttempts: 2 });
      setEmpty(!s || s?.month == null);
    } catch (error) {
      console.error('[boot] month summary check failed:', error);
      setEmpty(true);
    }
  })() }, [authReady, authOk, ready, month, refreshKey])

  const onCsvUploaded = useCallback(() => {
    setRefreshKey((k) => k + 1);
  emitToastSuccess(t('ui.toast.csv_ingested_title'), { description: t('ui.toast.csv_ingested_description') });
  }, []);

  const refreshLlm = useLlmStore(s => s.refresh);
  useEffect(() => { refreshLlm({ refreshModels: true }); }, [refreshLlm]);

  const showChatDock = useChatDockStore(s => s.visible);

  // Chat mounting removed: ChatDock now renders directly in JSX below (v2)
  // (Previously used ensureChatMounted() to create iframe-based chat)

  // Always call hooks above; render gates below
  if (!ready || !authReady) return <div className="p-6 text-[color:var(--text-muted)]">Loading…</div>;

  // Legal pages routing (before auth check so they're publicly accessible)
  const pathname = window.location.pathname;
  if (pathname === '/legal/privacy') return <PrivacyPage />;
  if (pathname === '/legal/terms') return <TermsPage />;
  if (pathname === '/legal/security') return <SecurityPage />;

  if (!authOk) return <LandingHero />;

  return (
  <MonthContext.Provider value={{ month, setMonth }}>
      <ChatDockProvider>
        <RuleSeedProvider>
  <NetActivityBlip />
      <div className="min-h-screen bg-gray-50 text-gray-900 p-6 dark:bg-gray-950 dark:text-gray-100">
  <HelpMode />
  <AppHelpMode />
  <HelpPanelHost />
  <HelpExplainListener />
  {/* Ensure this container is relative so ChatDock (absolute) positions within it */}
  <div className="relative">
          <div className="mx-auto max-w-6xl space-y-6">
  <header className="flex items-center justify-between gap-3 min-h-24 md:min-h-28 lg:min-h-32 xl:min-h-36 2xl:min-h-40">
          <Brand />
          <div className="flex items-center gap-3">
            <AboutDrawer showButton={false} />
            <TransactionsButton open={txPanelOpen} onOpen={() => setTxPanelOpen(true)} />
            <MonthPicker value={month} onChange={(m)=>{ setMonth(m); setGlobalMonth(m); }} />
            {flags.dev && (
              <DevMenu
                adminRulesOpen={adminRulesOpen}
                onToggleAdminRules={() => setAdminRulesOpen(!adminRulesOpen)}
                adminKnowledgeOpen={adminKnowledgeOpen}
                onToggleAdminKnowledge={() => setAdminKnowledgeOpen(!adminKnowledgeOpen)}
                openDevDock={devDockOpen}
                onToggleDevDock={() => {
                  const next = !devDockOpen;
                  setDevDockOpen(next);
                  try {
                    localStorage.setItem('DEV_DOCK', next ? '1' : '0');
                  } catch (_err) {
                    /* intentionally empty: swallow to render empty-state */
                  }
                }}
              />
            )}
            <AuthMenu onOpenSettings={() => setSettingsOpen(true)} />
          </div>
        </header>
  {/* Global mount of RuleTesterPanel (portal overlay) gated by dev flag */}
  {devUI && <RuleTesterPanel />}

        {!bannerDismissed && empty && (
          <TopEmptyBanner dbRev={dbRev ?? undefined} inSync={inSync} onDismiss={() => setBannerDismissed(true)} />
        )}

        {/* Upload CSV */}
        <section className="panel p-4 md:p-5">
          <UploadCsv defaultReplace={true} onUploaded={onCsvUploaded} />
        </section>

        {/* Insights */}
        <div className="section">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Insights</h2>
            <div className="flex items-center gap-2">
              <Switch
                id="include-pending-toggle"
                checked={includePending}
                onCheckedChange={setIncludePending}
                data-testid="include-pending-toggle"
              />
              <Label htmlFor="include-pending-toggle" className="text-sm cursor-pointer">
                Include pending in totals
              </Label>
            </div>
          </div>
          {insights && <AgentResultRenderer tool="insights.expanded" data={insights} />}
          {/* Anomalies quick card */}
          <InsightsAnomaliesCard />
        </div>
  {/* Agent chat box (legacy) — disabled; use ChatDock instead */}
  {/* <AgentChat /> */}
  {/* ChartsPanel now requires month; always pass the selected month */}
  <ChartsPanel month={month} refreshKey={refreshKey} />

        {/* Forecast (model + CI controls) */}
        <div className="section">
          <ForecastCard />
        </div>

        {/* Main grid - CANONICAL: Unknowns card with ML feedback suggestions */}
        <div className="section">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <UnknownsPanel month={month} refreshKey={refreshKey} />
          </div>
        </div>

        {/* Admin: Knowledge + Category Rules (dev-only, admin-only) */}
        {flags.dev && isAdmin && adminRulesOpen && (
          <div className="section">
            <Suspense fallback={
              <div className="p-4 text-sm text-muted-foreground">
                Loading admin tools…
              </div>
            }>
              <AdminRulesPanel />
            </Suspense>
          </div>
        )}
        {flags.dev && isAdmin && adminKnowledgeOpen && (
          <div className="section">
            <Suspense fallback={
              <div className="p-4 text-sm text-muted-foreground">
                Loading admin tools…
              </div>
            }>
              <AdminKnowledgePanel />
            </Suspense>
          </div>
        )}

        {/* CANONICAL: Rules table + Rule Tester + ML Status */}
        <div className="section">
          <div className="grid gap-6 lg:grid-cols-2">
            <RulesPanel refreshKey={refreshKey} />
            {(devUI && flags.ruleTester) ? <RuleTesterPanel /> : <div className="hidden lg:block" />}
            {flags.mlSelftest ? (
              <div className="lg:col-span-2">
                <MLStatusCard />
              </div>
            ) : null}
          </div>
        </div>

        {/* ML Feedback: Promoted Merchant Hints (dev-only, admin-only) */}
        {flags.dev && isAdmin && (
          <div className="section">
            <MerchantHintsPanel />
          </div>
        )}

          {/* Dev Dock at very bottom: only Planner DevTool */}
          {flags.dev && (
            <DevDock open={devDockOpen}>
              {flags.planner && <PlannerDevPanel />}
            </DevDock>
          )}
          {/* DevFab & DevModeSwitch removed to reduce redundancy; dropdown + keyboard remain */}
        </div>
      </div>
  </div>
      <TransactionsDrawer open={txPanelOpen} onClose={() => setTxPanelOpen(false)} />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ChatDock />
        </RuleSeedProvider>
  </ChatDockProvider>
    </MonthContext.Provider>
  );
};

export default App;
