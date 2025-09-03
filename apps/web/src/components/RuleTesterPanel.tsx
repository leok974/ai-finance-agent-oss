import React, { useState } from 'react'
import Card from './Card'
import { addRule, testRule, mlTrain } from '../lib/api'

export default function RuleTesterPanel({ onChanged }: { onChanged?: () => void }) {
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
    onChanged?.()
    alert('Saved → Retrained. Use Reclassify endpoint if needed.')
  }

return (
  <Card title="Rule Tester">
    {/* ... existing code ... */}
    </Card>
  )
}
