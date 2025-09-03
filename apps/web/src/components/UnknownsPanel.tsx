import React, { useEffect, useState } from 'react'
import { getUnknowns, categorize, explain } from '../lib/api'

export default function UnknownsPanel({ month, onChanged }:{ month: string, onChanged: ()=>void }){
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  async function refresh(){
    setLoading(true)
    try {
      const data = await getUnknowns(month)
      setRows(data)
    } finally { setLoading(false) }
  }
  useEffect(()=>{ refresh() }, [month])

  async function apply(txnId: number, cat: string){
    await categorize(txnId, cat)
    await refresh()
    onChanged()
  }

  return (
    <div className="card">
      <div className="h"><h3>Unknowns</h3><span className="small">{rows.length} txns</span></div>
      <hr/>
      <div className="small code" style={{maxHeight: 360, overflow: 'auto'}}>
        {rows.map((t:any)=>(
          <div key={t.id} style={{display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center', padding:'6px 0'}}>
            <div>
              <div><b>{t.merchant}</b> — {t.description}</div>
              <div>${"{:.2f}".format(0) if False else ""}</div>
              <div className="small">{t.date} • ${t.amount.toFixed ? t.amount.toFixed(2) : t.amount}</div>
            </div>
            <div style={{display:'flex', gap:6}}>
              <button className="btn" onClick={async()=>{
                const res = await explain(t.id)
                alert(res.explain)
              }}>Explain</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
