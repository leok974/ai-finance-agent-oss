import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { MonthContext } from "./context/MonthContext";
import UploadCsv from "./components/UploadCsv";
import UnknownsPanel from "./components/UnknownsPanel";
import SuggestionsPanel from "./components/SuggestionsPanel";
// import RuleTesterPanel from "./components/RuleTesterPanel"; // rendered only inside DevDock
import { AgentResultRenderer } from "./components/AgentResultRenderers";
import { useOkErrToast } from "@/lib/toast-helpers";
// import RulesPanel from "./components/RulesPanel";
import { getAlerts, getMonthSummary, getMonthMerchants, getMonthFlows, agentTools, meta, getHealthz, api, resolveMonthFromCharts } from './lib/api'
import { flags } from "@/lib/flags";
import AboutDrawer from './components/AboutDrawer';
import RulesPanel from "./components/RulesPanel";
import ChatDock from "./components/ChatDock";
import { useChatDockStore } from "./stores/chatdock";
import DevDock from "@/components/dev/DevDock";
import PlannerDevPanel from "@/components/dev/PlannerDevPanel";
import RuleTesterPanel from "@/components/RuleTesterPanel";
import MLStatusCard from "@/components/MLStatusCard";
import { ChatDockProvider } from "./context/ChatDockContext";
import ChartsPanel from "./components/ChartsPanel";
import TopEmptyBanner from "./components/TopEmptyBanner";
// import MLStatusCard from "./components/MLStatusCard"; // rendered only inside DevDock
import NetActivityBlip from "@/components/NetActivityBlip";
import LoginForm from "@/components/LoginForm";
import { useAuth } from "@/state/auth";
// import AgentChat from "./components/AgentChat"; // legacy chat bubble disabled
import { setGlobalMonth } from "./state/month";
// Providers are applied at the top-level (main.tsx)
import RuleSuggestionsPersistentPanel from "@/components/RuleSuggestionsPersistentPanel";
import InsightsAnomaliesCard from "./components/InsightsAnomaliesCard";
import ErrorBoundary from "@/components/ErrorBoundary";
import DevFab from "@/components/dev/DevFab";
import DevBadge from "@/components/dev/DevBadge";

// Log frontend version info
console.info("[Web] branch=", __WEB_BRANCH__, "commit=", __WEB_COMMIT__);


const App: React.FC = () => {
  const { ok } = useOkErrToast();
  const [devDockOpen, setDevDockOpen] = useState<boolean>(() => (import.meta as any).env?.VITE_DEV_UI === '1' || localStorage.getItem('DEV_DOCK') !== '0');
  const [month, setMonth] = useState<string>("");
  const [ready, setReady] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  // Legacy report removed: using expanded insights and charts exclusively
  const [insights, setInsights] = useState<any>(null)
  const [alerts, setAlerts] = useState<any>(null)
  const [empty, setEmpty] = useState<boolean>(false)
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false)
  const booted = useRef(false)
  const [dbRev, setDbRev] = useState<string | null>(null);
  const [inSync, setInSync] = useState<boolean | undefined>(undefined);

  // Quick keyboard toggle for Dev UI: Ctrl+Shift+D
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      try {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
          const v = (localStorage.getItem("DEV_UI") === "1") ? "0" : "1";
          localStorage.setItem("DEV_UI", v);
          location.reload();
        }
      } catch {}
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Initialize month once
  async function resolveMonth(): Promise<string> {
    // GET-only path compatible with older backend
    const viaCharts = await resolveMonthFromCharts();
    return viaCharts || "";
  }

  useEffect(() => {
    if (booted.current) return; // guard re-run in dev (StrictMode)
    booted.current = true;
    (async () => {
      console.info("[boot] resolving month…");
      const m = (await resolveMonth())
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

  const { user, authReady } = useAuth();
  const authOk = !!user;
  // Load dashboard data whenever month changes (only when authenticated)
  useEffect(() => {
    if (!authOk || !month) return;
    console.info("[boot] loading dashboards for month", month);
    void Promise.allSettled([
      agentTools.chartsSummary({ month }),
      agentTools.chartsMerchants({ month, limit: 10 }),
      agentTools.chartsFlows({ month }),
      agentTools.chartsSpendingTrends({ month, months_back: 6 }),
    ]);
  }, [authOk, month]);

  // Log DB health once after CORS/DB are good (boot complete) and capture db revision
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const h = await getHealthz();
        if (!alive) return;
  const db = h?.db_engine || 'unknown-db';
  const mig = h?.alembic_ok ?? h?.alembic?.in_sync ?? 'unknown';
  const models = h?.models_ok ?? 'unknown';
        setDbRev((h as any)?.db_revision ?? (h as any)?.alembic?.db_revision ?? null);
        setInSync((h as any)?.alembic_ok ?? (h as any)?.alembic?.in_sync);
        console.log(`[db] ${db} loaded | alembic_ok=${String(mig)} | models_ok=${String(models)}`);
      } catch (e) {
        console.warn('[db] healthz failed:', e);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load insights and alerts separately for state management
  useEffect(()=>{ (async()=>{
  if (!authOk || !ready || !month) return;
    try {
      setInsights(await agentTools.insightsExpanded({ month, large_limit: 10 }))
      setAlerts(await getAlerts(month))
    } catch {}
  })() }, [authOk, ready, month, refreshKey])

  // Probe backend emptiness (latest by default). If charts summary returns null or month:null, show banner.
  useEffect(() => { (async () => {
  if (!authOk || !ready || !month) return;
    try {
      const s = await getMonthSummary(month);
      setEmpty(!s || s?.month == null);
    } catch {
      setEmpty(true);
    }
  })() }, [authOk, ready, month, refreshKey])

  const onCsvUploaded = useCallback(() => {
    setRefreshKey((k) => k + 1);
    ok("Transactions imported. Panels refreshed.", "CSV ingested");
  }, [ok]);

  

  const showChatDock = useChatDockStore(s => s.visible);

  // Always call hooks above; render gates below
  if (!ready || !authReady) return <div className="p-6 text-[color:var(--text-muted)]">Loading…</div>;
  if (!authOk) return (
    <div className="p-6">
      <div className="max-w-md mx-auto"><LoginForm /></div>
    </div>
  );

  return (
  <MonthContext.Provider value={{ month, setMonth }}>
      <ChatDockProvider>
  <NetActivityBlip />
      <div className="min-h-screen bg-gray-50 text-gray-900 p-6 dark:bg-gray-950 dark:text-gray-100">
  {/* Ensure this container is relative so ChatDock (absolute) positions within it */}
  <div className="relative">
          <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Finance Agent</h1>
          <div className="flex items-center gap-3">
            <LoginForm />
            <AboutDrawer />
            <input type="month" className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2" value={month} onChange={e=>{ setMonth(e.target.value); setGlobalMonth(e.target.value); }} />
            <button className="btn btn-sm hover:bg-accent" onClick={()=>setRefreshKey(k=>k+1)}>Refresh</button>
            <a href="#rule-suggestions" className="btn btn-ghost btn-sm" title="Jump to persistent Rule Suggestions">Suggestions</a>
            {flags.dev && (
              <DevBadge
                // show branch/commit if available via globals
                branch={String((globalThis as any).__WEB_BRANCH__ ?? '')}
                commit={String((globalThis as any).__WEB_COMMIT__ ?? '')}
                openDevDock={devDockOpen}
                onToggleDevDock={() => {
                  const next = !devDockOpen; setDevDockOpen(next); try { localStorage.setItem('DEV_DOCK', next ? '1' : '0'); } catch {}
                }}
              />
            )}
          </div>
        </header>

        {!bannerDismissed && empty && (
          <TopEmptyBanner dbRev={dbRev ?? undefined} inSync={inSync} onDismiss={() => setBannerDismissed(true)} />
        )}

        {/* Upload CSV */}
        <section className="panel p-4 md:p-5">
          <UploadCsv defaultReplace={true} onUploaded={onCsvUploaded} />
        </section>

        {/* Insights */}
        <div className="section">
          {insights && <AgentResultRenderer tool="insights.expanded" data={insights} />}
          {/* Anomalies quick card */}
          <InsightsAnomaliesCard />
        </div>
  {/* Agent chat box (legacy) — disabled; use ChatDock instead */}
  {/* <AgentChat /> */}
  {/* ChartsPanel now requires month; always pass the selected month */}
  <ChartsPanel month={month} refreshKey={refreshKey} />

        {/* Main grid */}
        <div className="section">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <UnknownsPanel month={month} refreshKey={refreshKey} />
            <SuggestionsPanel />
          </div>
        </div>

        {/* Persistent rule suggestions table */}
        <div id="rule-suggestions" className="section">
          <ErrorBoundary fallback={(e)=> <div className="text-sm text-red-500">Failed to render suggestions: {String(e?.message||e)}</div>}>
            <RuleSuggestionsPersistentPanel />
          </ErrorBoundary>
        </div>

        {/* Rules + Rule Tester + ML Status */}
        <div className="section">
          <div className="grid gap-6 lg:grid-cols-2">
            <RulesPanel refreshKey={refreshKey} />
            {flags.ruleTester ? <RuleTesterPanel /> : <div className="hidden lg:block" />}
            {flags.mlSelftest ? (
              <div className="lg:col-span-2">
                <MLStatusCard />
              </div>
            ) : null}
          </div>
        </div>
          {showChatDock && <ChatDock data-chatdock-root />}

          {/* Dev Dock at very bottom: only Planner DevTool */}
          {flags.dev && (
            <DevDock open={devDockOpen}>
              {flags.planner && <PlannerDevPanel />}
            </DevDock>
          )}
          {flags.dev && <DevFab />}
        </div>
      </div>
  </div>
  </ChatDockProvider>
    </MonthContext.Provider>
  );
};

export default App;
