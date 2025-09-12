import { describe, it, expect } from 'vitest'
import { selectTopMerchantCat } from '@/selectors/explain'
import type { ExplainResponse } from '@/lib/api'

function makeData(byCategory: Array<{ category: string; count: number }>, total?: number): ExplainResponse {
  return {
    txn: { id: 1, date: '2025-08-01', merchant: 'Starbucks', amount: -4.5, category: 'Coffee' },
    evidence: {
      merchant_norm: 'starbucks',
      rule_match: null,
      similar: {
        total: total ?? byCategory.reduce((a, b) => a + (b.count || 0), 0),
        by_category: byCategory,
        recent_samples: [],
      },
      feedback: { txn_feedback: [], merchant_feedback: [] },
    },
    candidates: [],
    rationale: 'd',
    llm_rationale: null,
    mode: 'deterministic',
    actions: [],
  }
}

describe('selectTopMerchantCat', () => {
  it('returns null for null data', () => {
    expect(selectTopMerchantCat(null as any)).toBeNull()
  })

  it('returns null when similar absent', () => {
    const data = makeData([]) as any
    data.evidence.similar = undefined
    expect(selectTopMerchantCat(data)).toBeNull()
  })

  it('picks the first (highest count) from by_category', () => {
    const data = makeData([{ category: 'Coffee', count: 12 }, { category: 'Snacks', count: 3 }], 16)
    const res = selectTopMerchantCat(data)
    expect(res).toEqual({ cat: 'Coffee', count: 12, total: 16 })
  })

  it('returns null when by_category is empty', () => {
    const data = makeData([])
    expect(selectTopMerchantCat(data)).toBeNull()
  })
})
