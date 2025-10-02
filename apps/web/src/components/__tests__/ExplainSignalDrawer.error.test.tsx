import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'

vi.mock('@/api', async (importOriginal) => {
  const mod = await importOriginal() as typeof import('@/api')
  return { ...mod, getExplain: vi.fn() }
})

import ExplainSignalDrawer from '@/components/ExplainSignalDrawer'
import { getExplain } from '@/api'

describe('ExplainSignalDrawer – error state', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows skeletons, then replaces them with an error message on failure', async () => {
  (getExplain as unknown as { mockRejectedValue: (v: unknown) => void }).mockRejectedValue(new Error('load failed'))

    render(<ExplainSignalDrawer txnId={555} open={true} onOpenChange={() => {}} />)

    // while fetching, skeletons should be present
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)

    // then an error message should appear and skeletons disappear
    await waitFor(() => {
      expect(screen.getByText(/load failed/i)).toBeTruthy()
    })
    expect(screen.queryByTestId('skeleton')).toBeNull()
  })
})
