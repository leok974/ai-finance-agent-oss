import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/api', async (importOriginal) => {
  const mod = await importOriginal() as typeof import('@/api')
  return { ...mod, getExplain: vi.fn() }
})

import ExplainSignalDrawer from '@/components/ExplainSignalDrawer'
import { getExplain, type ExplainResponse } from '@/api'

describe('ExplainSignalDrawer – LLM mode close behavior', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders LLM badge/lead and calls onOpenChange(false) when Close is clicked', async () => {
    const mock: ExplainResponse = {
      txn: { id: 4242, date: '2025-08-03', merchant: 'Starbucks', amount: -3.21, category: 'Coffee' },
      evidence: {
        merchant_norm: 'starbucks',
        similar: { total: 12, by_category: [{ category: 'Coffee', count: 12 }] },
        feedback: { merchant_feedback: [{ category: 'Coffee', positives: 7, negatives: 0 }] },
        rule_match: null,
      },
      candidates: [{ source: 'history', category: 'Coffee', confidence: 0.95 }],
      rationale: 'Base deterministic',
      llm_rationale: 'This was classified as Coffee because you consistently mark Starbucks as Coffee (12 prior).',
      mode: 'llm',
    }

    ;(getExplain as any).mockResolvedValue(mock)

    const onOpenChange = vi.fn()
    const user = userEvent.setup()

    render(<ExplainSignalDrawer txnId={4242} open={true} onOpenChange={onOpenChange} />)

    await waitFor(() => {
      expect(screen.getByTestId('explain-drawer')).toBeTruthy()
      expect(screen.getByText(/LLM rephrase/i)).toBeTruthy()
    })

    // lead should come from llm_rationale
    expect(
      screen.getByText(/This was classified as Coffee because you consistently mark Starbucks/i)
    ).toBeTruthy()

    // Close behavior
    await user.click(screen.getByTestId('drawer-close'))
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
