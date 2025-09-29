import React from 'react'
import Card from './Card'
import { t } from '@/lib/i18n'

export default function InsightsCard({ insights }: { insights: any }) {
  if (!insights) return null
  const items = Array.isArray(insights) ? insights : insights.items || []
  return (
  <Card title={t('ui.insights.title')} className="help-spot" data-help-key="cards.insights_list" data-help-id="list">
      <ul className="space-y-2">
        {items.map((it: any, i: number) => (
          <li key={i} className="p-3 rounded-lg bg-neutral-900 border border-neutral-800">
            <div className="text-sm opacity-80">{it.title ?? it.type ?? t('ui.insights.item_fallback')}</div>
            <div className="text-base">{it.text ?? it.detail ?? JSON.stringify(it)}</div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
