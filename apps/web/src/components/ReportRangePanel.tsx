import React from 'react'
import Card from './Card'
import { money } from '../lib/money'

export default function ReportRangePanel({ report }: { report: any }) {
  if (!report) return null
  const rows = report?.categories ?? []
  return (
    <Card title="Report Range">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {rows.map((r: any) => (
          <div key={r.name} className="flex items-center justify-between rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2">
            <span className="opacity-85">{r.name}</span>
            <span className="font-mono">{money(r.amount)}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
