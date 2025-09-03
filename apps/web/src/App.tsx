import React, { useEffect, useMemo, useState } from 'react'
import './styles.css'
import { money } from './lib/money'
import { getReport, mlSuggest, uploadCsv, getUnknowns, budgetCheck } from './lib/api'
import SuggestionsPanel from './components/SuggestionsPanel'
import UnknownsPanel from './components/UnknownsPanel'

export default function App() {
  const [month, setMonth] = useState('2025-08')
  const [report, setReport] = useState<any>(null)
  const [unknowns, setUnknowns] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true); setError(null)
    try {
      const [r, u] = await Promise.all([getReport(month), getUnknowns(month)])
      setReport(r); setUnknowns(u)
    } catch (e:any) {
      setError(e?.message || 'Failed to load')
    } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [month])

  async function onUploadCSV(e: any) {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      await uploadCsv(f)
      await refresh()
    } catch (e:any) { alert('Upload failed: ' + (e?.message || e)) }
    finally { e.target.value = '' }
  }

  return (
    <div className="container">
      <div className="h">
        <h1>AI Finance Agent</h1>
        <div className="row" style={{gap:8}}>
          <input className="input" value={month} onChange={e=>setMonth(e.target.value)} placeholder="YYYY-MM" />
          <label className="btn" style={{display:'inline-block'}}>
            Load CSV
            <input type="file" accept=".csv" onChange={onUploadCSV} style={{display:'none'}} />
          </label>
          <button className="btn" onClick={refresh}>Refresh</button>
        </div>
      </div>

      {error && <div className="card" style={{borderColor:'#b91c1c'}}>Error: {error}</div>}

      <div className="row">
        <div className="col">
          <div className="card">
            <div className="h">
              <h3>Report — {month}</h3>
              <span className="badge">{report ? money(report.total) : '--'}</span>
            </div>
            <hr/>
            <div className="small code">
              {(report?.by_category||[]).map((r:any)=>(
                <div key={r.category} style={{display:'flex',justifyContent:'space-between'}}>
                  <span>{r.category}</span><span>{money(r.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col">
          <UnknownsPanel month={month} onChanged={refresh} />
        </div>
      </div>

      <div className="row">
        <div className="col">
          <SuggestionsPanel month={month} onChanged={refresh} />
        </div>
      </div>

      {loading && <div className="small">Loading…</div>}
    </div>
  )
}
