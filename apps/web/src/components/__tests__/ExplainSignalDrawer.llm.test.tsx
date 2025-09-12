import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

import ExplainSignalDrawer from '@/components/ExplainSignalDrawer'
import * as api from '@/api'

vi.mock('@/api', async (importOriginal) => {
  const mod = await importOriginal() as typeof import('@/api')
  return {
    ...mod,
    getExplain: vi.fn(async () => ({
      txn: { id: 1, merchant: 'Acme', amount: 12.34, date: '2025-01-01' },
      evidence: {
        merchant_norm: 'acme',
        similar: { total: 3, by_category: [{ category: 'Food', count: 3 }] },
        feedback: { merchant_feedback: [{ category: 'Food', positives: 2, negatives: 0 }] },
      },
      candidates: [
        { source: 'history', category: 'Food', confidence: 0.9 },
      ],
      rationale: 'Base rationale',
      llm_rationale: 'LLM: Because similar grocery purchases from Acme in recent months.',
      mode: 'llm',
    }))
  }
})

function Wrapper() {
  const [open, setOpen] = React.useState(true)
  return <ExplainSignalDrawer txnId={1} open={open} onOpenChange={setOpen} />
}

describe('ExplainSignalDrawer - LLM rephrase mode', () => {
  it('shows LLM chip and rationale text', async () => {
    render(<Wrapper />)

    // Chip should indicate LLM mode
    await screen.findByText(/LLM rephrase/i)

    // The LLM rationale should show, not the base rationale
    await waitFor(() => {
      expect(screen.getByText(/LLM: Because similar grocery purchases/i)).toBeTruthy()
      expect(screen.queryByText(/Base rationale/)).toBeNull()
    })

    // Ensure API was called
    expect(api.getExplain).toHaveBeenCalledWith(1)
  })
})
