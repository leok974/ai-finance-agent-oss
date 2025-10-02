import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock API
vi.mock('@/api', async (importOriginal) => {
  const mod = await importOriginal() as typeof import('@/api')
  return {
    ...mod,
    getExplain: vi.fn(),
  }
})

import ExplainSignalDrawer from '@/components/ExplainSignalDrawer'
import { getExplain, type ExplainResponse } from '@/api'

const baseTxn = { id: 999, date: '2025-08-01', merchant: 'Starbucks', amount: -4.5, category: 'Coffee' };
// Cast via unknown to satisfy minimal ExplainResponse requirements used by component
const mockExplain = {
  rationale: 'We\u2019ve seen starbucks labeled as Coffee 12 time(s).',
  mode: 'deterministic',
  evidence: {
    merchant_norm: 'starbucks'
  }
} as unknown as ExplainResponse;

describe('ExplainSignalDrawer – integration (open/close)', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('mounts closed, renders when opened, unmounts when closed', async () => {
  (getExplain as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(mockExplain)
    const onOpenChange = vi.fn()

  const { rerender } = render(<ExplainSignalDrawer txnId={999} open={false} onOpenChange={onOpenChange} txn={baseTxn} />)
    expect(screen.queryByTestId('explain-drawer')).toBeNull()

  rerender(<ExplainSignalDrawer txnId={999} open={true} onOpenChange={onOpenChange} txn={baseTxn} />)

    await waitFor(() => expect(screen.getByTestId('explain-drawer')).toBeTruthy())
    // deterministic chip should render
    await screen.findByText(/Deterministic/i)

    // Close via prop
  rerender(<ExplainSignalDrawer txnId={999} open={false} onOpenChange={onOpenChange} txn={baseTxn} />)
    await waitFor(() => expect(screen.queryByTestId('explain-drawer')).toBeNull())
  })

  it('calls onOpenChange(false) when clicking the Close button', async () => {
  (getExplain as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(mockExplain)

    const user = userEvent.setup()
    const onOpenChange = vi.fn()

  render(<ExplainSignalDrawer txnId={999} open={true} onOpenChange={onOpenChange} txn={baseTxn} />)

    await waitFor(() => expect(screen.getByTestId('explain-drawer')).toBeTruthy())

    await user.click(screen.getByTestId('drawer-close'))
    expect(onOpenChange).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
