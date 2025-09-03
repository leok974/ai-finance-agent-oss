import React, { useState } from 'react'
import { agentChat } from '../lib/api'

export default function ChatDock({ context }: { context?: any }) {
  const [open, setOpen] = useState(true)
  const [input, setInput] = useState('')
  const [msgs, setMsgs] = useState<{ role: 'user'|'assistant'; text: string }[]>([])

  async function send() {
    const text = input.trim(); if (!text) return
    setMsgs(m => [...m, { role: 'user', text }])
    setInput('')
    try {
      const res = await agentChat(text, context)
      setMsgs(m => [...m, { role: 'assistant', text: res?.reply ?? JSON.stringify(res) }])
    } catch (e: any) {
      setMsgs(m => [...m, { role: 'assistant', text: `Error: ${e.message}` }])
    }
  }

  return (
    <div className={`fixed left-4 bottom-4 w-80 ${open ? '' : 'opacity-70'}`}>
      <div className="card">
        <header className="flex items-center justify-between mb-2">
          <strong>Finance Chat</strong>
          <button className="text-sm opacity-70 hover:opacity-100" onClick={() => setOpen(o=>!o)}>{open?'–':'+'}</button>
        </header>
        {open && (
          <div className="space-y-2">
            <div className="h-48 overflow-auto rounded border border-neutral-800 p-2 bg-neutral-950">
              {msgs.map((m,i)=> (
                <div key={i} className={`mb-2 ${m.role==='user'?'text-blue-300':'text-neutral-200'}`}>{m.role==='user'? 'You: ' : 'AI: '}{m.text}</div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 bg-neutral-900 rounded px-3 py-2 outline-none border border-neutral-800" value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask about this month..." />
              <button onClick={send} className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500">Send</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
