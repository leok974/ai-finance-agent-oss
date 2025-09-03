import React, { useMemo, useState, useCallback, useEffect } from "react";
import UploadCsv from "./components/UploadCsv";
import UnknownsPanel from "./components/UnknownsPanel";
import SuggestionsPanel from "./components/SuggestionsPanel";
import RuleTesterPanel from "./components/RuleTesterPanel";
import InsightsCard from "./components/InsightsCard";
import { useToast } from "./components/Toast";
// import RulesPanel from "./components/RulesPanel";
import { getReport, getInsights, getAlerts, getMonthSummary, getMonthMerchants, getMonthFlows } from './lib/api'
import RulesPanel from "./components/RulesPanel";
import ChatDock from "./components/ChatDock";
import ChartsPanel from "./components/ChartsPanel";


const App: React.FC = () => {
  const { push } = useToast();
  const [month, setMonth] = useState<string>("2023-12");
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [report, setReport] = useState<any>(null)
  const [insights, setInsights] = useState<any>(null)
  const [alerts, setAlerts] = useState<any>(null)

  useEffect(()=>{ (async()=>{
    try {
      setReport(await getReport(month))
      setInsights(await getInsights(month))
      setAlerts(await getAlerts(month))
      await Promise.all([getMonthSummary(month), getMonthMerchants(month), getMonthFlows(month)])
    } catch {}
  })() }, [month, refreshKey])

  const onCsvUploaded = useCallback(() => {
    setRefreshKey((k) => k + 1);
    push({ title: "CSV ingested", message: "Transactions imported. Panels refreshed." });
  }, [push]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6 dark:bg-gray-950 dark:text-gray-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Finance Agent</h1>
          <div className="flex items-center gap-3">
            <input type="month" className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2" value={month} onChange={e=>setMonth(e.target.value)} />
            <button className="px-3 py-2 rounded bg-neutral-800" onClick={()=>setRefreshKey(k=>k+1)}>Refresh</button>
          </div>
        </header>

        {/* Upload CSV */}
        <UploadCsv defaultReplace={true} onUploaded={onCsvUploaded} />

        {/* Insights */}
  <InsightsCard insights={insights} />
  {/* ChartsPanel can omit month to use latest by default */}
  <ChartsPanel refreshKey={refreshKey} />

        {/* Main grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <UnknownsPanel refreshKey={refreshKey} />
          <SuggestionsPanel refreshKey={refreshKey} />
        </div>

        {/* Rules + Tester */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <RulesPanel refreshKey={refreshKey} />
          <RuleTesterPanel onChanged={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>
  <ChatDock />
    </div>
  );
};

export default App;
