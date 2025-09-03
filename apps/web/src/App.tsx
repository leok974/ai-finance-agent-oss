import React, { useEffect, useMemo, useState } from 'react'
import Card from './components/Card'
import UnknownsPanel from './components/UnknownsPanel'
import SuggestionsPanel from './components/SuggestionsPanel'
import RuleTesterPanel from './components/RuleTesterPanel'
import ReportRangePanel from './components/ReportRangePanel'
import InsightsCard from './components/InsightsCard'
import ChatDock from './components/ChatDock'
import { getReport, getInsights, getAlerts, getMonthSummary, getMonthMerchants, getMonthFlows } from './lib/api'

export default function App() {
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0,7))
  const [report, setReport] = useState<any>(null)
  const [insights, setInsights] = useState<any>(null)
  const [alerts, setAlerts] = useState<any>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(()=>{ (async()=>{
    try {
      setReport(await getReport(month))
      setInsights(await getInsights(month))
      setAlerts(await getAlerts(month))
      await Promise.all([getMonthSummary(month), getMonthMerchants(month), getMonthFlows(month)])
    } catch {}
  })() }, [month, refreshKey])

  const ctx = useMemo(()=> ({ month, alerts, insights }), [month, alerts, insights])

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Finance Agent</h1>
          <div className="flex items-center gap-3">
            <input type="month" className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2" value={month} onChange={e=>setMonth(e.target.value)} />
            <button className="px-3 py-2 rounded bg-neutral-800" onClick={()=>setRefreshKey(k=>k+1)}>Refresh</button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-4">
            <SuggestionsPanel month={month} refreshKey={refreshKey} />
            <UnknownsPanel month={month} onChanged={()=>setRefreshKey(k=>k+1)} />
          </div>
          <div className="space-y-4">
            <ReportRangePanel report={report} />
            <InsightsCard insights={insights} />
            <Card title="Alerts">
              <pre className="text-xs bg-neutral-950 border border-neutral-800 rounded p-3 overflow-auto">{alerts ? JSON.stringify(alerts, null, 2) : '—'}</pre>
            </Card>
            <RuleTesterPanel />
          </div>
        </div>
      </div>

      <ChatDock context={ctx} />
    </div>
  )
}
