import React, { useMemo, useState, useCallback, useEffect } from "react";
import { MonthContext } from "./context/MonthContext";
import UploadCsv from "./components/UploadCsv";
import UnknownsPanel from "./components/UnknownsPanel";
import SuggestionsPanel from "./components/SuggestionsPanel";
import RuleTesterPanel from "./components/RuleTesterPanel";
import InsightsCard from "./components/InsightsCard";
import { useToast } from "./components/Toast";
// import RulesPanel from "./components/RulesPanel";
import { getReport, getInsights, getAlerts, getMonthSummary, getMonthMerchants, getMonthFlows, fetchLatestMonth, agentTools } from './lib/api'
import RulesPanel from "./components/RulesPanel";
import ChatDock from "./components/ChatDock";
import ChartsPanel from "./components/ChartsPanel";
import TopEmptyBanner from "./components/TopEmptyBanner";
import AgentChat from "./components/AgentChat";


const App: React.FC = () => {
  const { push } = useToast();
  const [month, setMonth] = useState<string>("");
  const [monthReady, setMonthReady] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [report, setReport] = useState<any>(null)
  const [insights, setInsights] = useState<any>(null)
  const [alerts, setAlerts] = useState<any>(null)
  const [empty, setEmpty] = useState<boolean>(false)
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false)

  // Resolve month on startup from backend (transactions.search), with calendar fallback
  useEffect(() => { (async () => {
    console.log("🔍 App startup: resolving latest month...");
    try {
      const m = await fetchLatestMonth();
      console.log("📅 fetchLatestMonth returned:", m);
      if (m) {
        console.log("✅ Setting month to:", m);
        setMonth(m);
      } else {
        const now = new Date();
        const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        console.log("⚠️ No month from backend, using fallback:", fallback);
        setMonth(fallback);
      }
    } catch (error) {
      console.error("❌ Error fetching latest month:", error);
      const now = new Date();
      const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      console.log("🔄 Error fallback month:", fallback);
      setMonth(fallback);
    } finally {
      console.log("🏁 Month resolution complete");
      setMonthReady(true);
    }
  })() }, []);

  useEffect(()=>{ (async()=>{
    if (!monthReady || !month) return;
    try {
      setReport(await getReport(month))
      setInsights(await getInsights(month))
      setAlerts(await getAlerts(month))
      await Promise.all([
        getMonthSummary(month),
        getMonthMerchants(month),
        getMonthFlows(month)
      ])
      // Ensure charts agent endpoint is also exercised with an explicit month
      void agentTools.chartsSummary({ month })
    } catch {}
  })() }, [monthReady, month, refreshKey])

  // Ensure app reloads charts/insights when the month changes (background, non-blocking)
  useEffect(() => {
    if (!month) return;
    void Promise.allSettled([
      getReport(month),
      agentTools.chartsSummary({ month }),
      agentTools.chartsMerchants({ month, limit: 10 }),
      agentTools.chartsFlows({ month }),
      agentTools.chartsSpendingTrends({ month, months_back: 6 } as any),
    ]);
  }, [month]);

  // Probe backend emptiness (latest by default). If charts summary returns null or month:null, show banner.
  useEffect(() => { (async () => {
    if (!monthReady || !month) return;
    try {
      const s = await getMonthSummary(month);
      setEmpty(!s || s?.month == null);
    } catch {
      setEmpty(true);
    }
  })() }, [monthReady, month, refreshKey])

  const onCsvUploaded = useCallback(() => {
    setRefreshKey((k) => k + 1);
    push({ title: "CSV ingested", message: "Transactions imported. Panels refreshed." });
  }, [push]);

  if (!monthReady) {
    return <div className="p-6 text-gray-600">Loading…</div>;
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
  <InsightsCard insights={insights} />
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
