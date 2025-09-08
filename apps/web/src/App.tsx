import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { MonthContext } from "./context/MonthContext";
import UploadCsv from "./components/UploadCsv";
import UnknownsPanel from "./components/UnknownsPanel";
import SuggestionsPanel from "./components/SuggestionsPanel";
import RuleTesterPanel from "./components/RuleTesterPanel";
import { AgentResultRenderer } from "./components/AgentResultRenderers";
import { useOkErrToast } from "@/lib/toast-helpers";
// import RulesPanel from "./components/RulesPanel";
import { getAlerts, getMonthSummary, getMonthMerchants, getMonthFlows, agentTools, meta, resolveLatestMonthHybrid, getHealthz } from './lib/api'
import DbRevBadge from './components/DbRevBadge';
import AboutDrawer from './components/AboutDrawer';
import RulesPanel from "./components/RulesPanel";
import ChatDock from "./components/ChatDock";
import { ChatDockProvider } from "./context/ChatDockContext";
import ChartsPanel from "./components/ChartsPanel";
import TopEmptyBanner from "./components/TopEmptyBanner";
// import AgentChat from "./components/AgentChat"; // legacy chat bubble disabled
import { setGlobalMonth } from "./state/month";
import { Providers } from "@/components/Providers";

// Log frontend version info
console.info("[Web] branch=", __WEB_BRANCH__, "commit=", __WEB_COMMIT__);


const App: React.FC = () => {
  const { ok } = useOkErrToast();
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

  // Initialize month once
  useEffect(() => {
    if (booted.current) return; // guard re-run in dev (StrictMode)
    booted.current = true;
    (async () => {
      console.info("[boot] resolving month…");
      const m = (await resolveLatestMonthHybrid())
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

  // Load dashboard data whenever month changes
  useEffect(() => {
    if (!month) return;
    console.info("[boot] loading dashboards for month", month);
    void Promise.allSettled([
      agentTools.chartsSummary({ month }),
      agentTools.chartsMerchants({ month, limit: 10 }),
      agentTools.chartsFlows({ month }),
      agentTools.chartsSpendingTrends({ month, months_back: 6 }),
    ]);
  }, [month]);

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
    if (!ready || !month) return;
    try {
      setInsights(await agentTools.insightsExpanded({ month, large_limit: 10 }))
      setAlerts(await getAlerts(month))
    } catch {}
  })() }, [ready, month, refreshKey])

  // Probe backend emptiness (latest by default). If charts summary returns null or month:null, show banner.
  useEffect(() => { (async () => {
    if (!ready || !month) return;
    try {
      const s = await getMonthSummary(month);
      setEmpty(!s || s?.month == null);
    } catch {
      setEmpty(true);
    }
  })() }, [ready, month, refreshKey])

  const onCsvUploaded = useCallback(() => {
    setRefreshKey((k) => k + 1);
    ok("Transactions imported. Panels refreshed.", "CSV ingested");
  }, [ok]);

  if (!ready) {
    return <div className="p-6 text-[color:var(--text-muted)]">Loading…</div>;
  }

  return (
    <MonthContext.Provider value={{ month, setMonth }}>
      <Providers>
      <ChatDockProvider>
      <div className="min-h-screen bg-gray-50 text-gray-900 p-6 dark:bg-gray-950 dark:text-gray-100">
        <div className="relative">
          <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Finance Agent</h1>
          <div className="flex items-center gap-3">
            <DbRevBadge dbRevision={dbRev ?? undefined} inSync={inSync} />
            <AboutDrawer />
            <input type="month" className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2" value={month} onChange={e=>{ setMonth(e.target.value); setGlobalMonth(e.target.value); }} />
            <button className="btn btn-sm hover:bg-accent" onClick={()=>setRefreshKey(k=>k+1)}>Refresh</button>
          </div>
        </header>

        {!bannerDismissed && empty && (
          <TopEmptyBanner dbRev={dbRev ?? undefined} inSync={inSync} onDismiss={() => setBannerDismissed(true)} />
        )}

        {/* Upload CSV */}
  <UploadCsv defaultReplace={true} onUploaded={onCsvUploaded} />

        {/* Insights */}
        {insights && <AgentResultRenderer tool="insights.expanded" data={insights} />}
  {/* Agent chat box (legacy) — disabled; use ChatDock instead */}
  {/* <AgentChat /> */}
  {/* ChartsPanel now requires month; always pass the selected month */}
  <ChartsPanel month={month} refreshKey={refreshKey} />

        {/* Main grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <UnknownsPanel month={month} refreshKey={refreshKey} />
          <SuggestionsPanel />
        </div>

        {/* Rules + Tester */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <RulesPanel refreshKey={refreshKey} />
          <RuleTesterPanel onChanged={() => setRefreshKey((k) => k + 1)} />
          </div>
          <ChatDock />
        </div>
      </div>
  </div>
  </ChatDockProvider>
  </Providers>
    </MonthContext.Provider>
  );
};

export default App;
