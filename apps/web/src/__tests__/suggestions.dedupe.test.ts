import { describe, it, expect } from 'vitest'
import { mergeSuggestions } from '@/utils/suggestions'

describe('mergeSuggestions', () => {
  it('dedupes case + whitespace variants', () => {
    const r = mergeSuggestions(
      ['View KPIs', ' View Merchants', 'Set budget from forecast '],
      ['view kpis', 'VIEW MERCHANTS', 'Set Budget From Forecast']
    )
    expect(r).toEqual([
      'View KPIs',
      'View Merchants',
      'Set budget from forecast'
    ])
  })
})
