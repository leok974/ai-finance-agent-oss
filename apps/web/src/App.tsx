import React, { useMemo, useState, useCallback, useEffect } from "react";
import { MonthContext } from "./context/MonthContext";
import UploadCsv from "./components/UploadCsv";
import UnknownsPanel from "./components/UnknownsPanel";
import SuggestionsPanel from "./components/SuggestionsPanel";
import RuleTesterPanel from "./components/RuleTesterPanel";
import { AgentResultRenderer } from "./components/AgentResultRenderers";
import { useToast } from "./components/Toast";
// import RulesPanel from "./components/RulesPanel";
import { getReport, getAlerts, getMonthSummary, getMonthMerchants, getMonthFlows, fetchLatestMonth, agentTools } from './lib/api'
import RulesPanel from "./components/RulesPanel";
import ChatDock from "./components/ChatDock";
import ChartsPanel from "./components/ChartsPanel";
import TopEmptyBanner from "./components/TopEmptyBanner";
import AgentChat from "./components/AgentChat";


const App: React.FC = () => {
  const { push } = useToast();
  const [month, setMonth] = useState<string>("");
  const [ready, setReady] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [report, setReport] = useState<any>(null)
  const [insights, setInsights] = useState<any>(null)
  const [alerts, setAlerts] = useState<any>(null)
  const [empty, setEmpty] = useState<boolean>(false)
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false)

  // 1) ask backend for the true latest month before rendering the app
  useEffect(() => {
    (async () => {
      const backendMonth = await fetchLatestMonth();
      if (backendMonth) {
        setMonth(backendMonth);
      } else {
        // fallback: current calendar month
        const now = new Date();
        setMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
      }
      setReady(true);
    })();
  }, []);

  // 2) whenever month changes, (re)load dashboard data
  useEffect(() => {
    if (!ready || !month) return;
    void Promise.allSettled([
      getReport(month),
      agentTools.chartsSummary({ month }),
      agentTools.chartsMerchants({ month, limit: 10 }),
      agentTools.chartsFlows({ month }),
      agentTools.chartsSpendingTrends({ month, months_back: 6 }),
    ]);
  }, [ready, month]);

  // Load insights and alerts separately for state management
  useEffect(()=>{ (async()=>{
    if (!ready || !month) return;
    try {
      setReport(await getReport(month))
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
    push({ title: "CSV ingested", message: "Transactions imported. Panels refreshed." });
  }, [push]);

  if (!ready) {
    return <div className="p-6 text-[color:var(--text-muted)]">Loading…</div>;
  }

  return (
    <MonthContext.Provider value={{ month, setMonth }}>
      <div className="min-h-screen bg-gray-50 text-gray-900 p-6 dark:bg-gray-950 dark:text-gray-100">
        <div className="relative">
          <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Finance Agent</h1>
          <div className="flex items-center gap-3">
            <input type="month" className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2" value={month} onChange={e=>setMonth(e.target.value)} />
            <button className="px-3 py-2 rounded bg-neutral-800" onClick={()=>setRefreshKey(k=>k+1)}>Refresh</button>
          </div>
        </header>

        {!bannerDismissed && empty && (
          <TopEmptyBanner onDismiss={() => setBannerDismissed(true)} />
        )}

        {/* Upload CSV */}
  <UploadCsv defaultReplace={true} onUploaded={onCsvUploaded} />

        {/* Insights */}
        {insights && <AgentResultRenderer tool="insights.expanded" data={insights} />}
        {/* Agent chat box */}
        <AgentChat />
  {/* ChartsPanel now requires month; always pass the selected month */}
  <ChartsPanel month={month} refreshKey={refreshKey} />

        {/* Main grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <UnknownsPanel month={month} refreshKey={refreshKey} />
          <SuggestionsPanel month={month} refreshKey={refreshKey} />
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
    </MonthContext.Provider>
  );
};

export default App;
