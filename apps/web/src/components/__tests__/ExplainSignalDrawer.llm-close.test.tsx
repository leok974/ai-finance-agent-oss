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
    const mock = {
      rationale: 'Base deterministic',
      llm_rationale: 'This was classified as Coffee because you consistently mark Starbucks as Coffee (12 prior).',
      mode: 'llm',
      evidence: { merchant_norm: 'starbucks' }
    } as unknown as ExplainResponse;

    (getExplain as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(mock)

    const onOpenChange = vi.fn()
    const user = userEvent.setup()

  render(<ExplainSignalDrawer txnId={4242} open={true} onOpenChange={onOpenChange} txn={{ id:4242, merchant:'Starbucks', date:'2025-08-03', amount:-3.21, category:'Coffee' }} />)

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
