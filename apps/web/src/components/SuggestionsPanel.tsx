import React, { useEffect, useMemo, useState } from 'react'
import { mlSuggest, categorize } from '../lib/api'

type Card = { txn:any, suggestions: Array<{category:string, confidence:number}> }
export default function SuggestionsPanel({ month, onChanged }:{ month: string, onChanged: ()=>void }){
  const [cards, setCards] = useState<Card[]>([])
  const [selected, setSelected] = useState<Record<number,string>>({})
  const [loading, setLoading] = useState(false)
  const [threshold, setThreshold] = useState(0.7)

  async function refresh(){
    setLoading(true)
    try{
      const data = await mlSuggest(month, 50, 3)
      const rows: Card[] = data.results || []
      // ensure no duplicate categories per card (backend also dedups)
      rows.forEach(r=>{
        const seen = new Set<string>()
        r.suggestions = r.suggestions.filter(s=>{
          const key = s.category.trim().toLowerCase()
          if (seen.has(key)) return False
          seen.add(key); return true
        })
      })
      setCards(rows)
      setSelected({})
    } finally { setLoading(false) }
  }
  useEffect(()=>{ refresh() }, [month])

  async function applyOne(card: Card){
    const cat = selected[card.txn.id] || card.suggestions[0]?.category
    if (!cat) return
    await categorize(card.txn.id, cat)
    await refresh()
    onChanged()
  }

  async function autoApplyBest(){
    for (const card of cards){
      const best = card.suggestions[0]
      if (best && best.confidence >= threshold){
        await categorize(card.txn.id, best.category)
      }
    }
    await refresh(); onChanged()
  }

  return (
    <div className="card">
      <div className="h">
        <h3>ML Suggestions</h3>
        <div className="small">Auto-apply ≥ 
          <input type="number" min={0} max={1} step={0.05} value={threshold} onChange={e=>setThreshold(parseFloat(e.target.value))} className="input" style={{width:80, marginLeft:8}}/>
          <button className="btn" onClick={autoApplyBest} style={{marginLeft:8}}>Auto-apply best</button>
        </div>
      </div>
      <hr/>
      {loading && <div className="small">Loading…</div>}
      <div style={{display:'grid', gap:10, maxHeight: 400, overflow:'auto'}}>
        {cards.map(card=> (
          <div key={card.txn.id} className="card" style={{padding:12}}>
            <div className="h"><b>{card.txn.merchant}</b><span className="small">{card.txn.date} • ${card.txn.amount}</span></div>
            <div className="small">{card.txn.description}</div>
            <div className="small" style={{marginTop:8}}>
              {card.suggestions.map(s=> (
                <label key={s.category} style={{display:'inline-flex', alignItems:'center', gap:6, marginRight:12}}>
                  <input type="radio" name={`s-${card.txn.id}`} onChange={()=>setSelected(v=>({...v, [card.txn.id]: s.category}))} />
                  <span>{s.category} <span style={{opacity:.7}}>({Math.round(s.confidence*100)}%)</span></span>
                </label>
              ))}
            </div>
            <div style={{marginTop:8, display:'flex', gap:8}}>
              <button className="btn" onClick={()=>applyOne(card)}>Apply</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
