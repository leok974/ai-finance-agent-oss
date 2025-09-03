import React, { useState } from 'react'
import Card from './Card'
import { addRule, testRule, mlTrain } from '../lib/api'

export default function RuleTesterPanel() {
  const [seed, setSeed] = useState<{ merchant?: string; description?: string } | null>(null)
  const [resp, setResp] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function onTest() {
    if (!seed) return
    setLoading(true)
    try { setResp(await testRule(seed)) } finally { setLoading(false) }
  }
  async function onSaveFlow() {
    if (!resp?.rule) return
    await addRule(resp.rule)
    await mlTrain(undefined, 2)
    alert('Saved → Retrained. Use Reclassify endpoint if needed.')
  }

  return (
    <Card title="Rule Tester">
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2" placeholder="Merchant contains…" value={seed?.merchant ?? ''} onChange={e=>setSeed(s=>({ ...(s||{}), merchant: e.target.value }))} />
          <input className="bg-neutral-900 border border-neutral-800 rounded px-3 py-2" placeholder="Description contains…" value={seed?.description ?? ''} onChange={e=>setSeed(s=>({ ...(s||{}), description: e.target.value }))} />
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded bg-neutral-800" onClick={()=>setSeed(null)}>Clear</button>
          <button className="px-3 py-2 rounded bg-blue-700" onClick={onTest} disabled={loading}>Test</button>
          <button className="px-3 py-2 rounded bg-emerald-700" onClick={onSaveFlow} disabled={!resp?.rule}>Save → Retrain</button>
        </div>
        {resp && (
          <pre className="bg-neutral-950 border border-neutral-800 rounded p-3 overflow-auto text-xs">{JSON.stringify(resp,null,2)}</pre>
        )}
      </div>
    </Card>
  )
}
