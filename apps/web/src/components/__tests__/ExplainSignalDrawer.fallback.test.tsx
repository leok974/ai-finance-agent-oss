import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'

vi.mock('@/api', async (importOriginal) => {
  const mod = await importOriginal() as typeof import('@/api')
  return { ...mod, getExplain: vi.fn() }
})

import ExplainSignalDrawer from '@/components/ExplainSignalDrawer'
import { getExplain, type ExplainResponse } from '@/api'

const baseTxn = { id: 777, date: '2025-09-01', merchant: 'Target', amount: -25.15, category: 'Groceries' }
const evidence = { merchant_norm: 'target', rule_match: { id: 12, category: 'Groceries' } }

function renderDrawer() {
  return render(<ExplainSignalDrawer txnId={777} open={true} onOpenChange={() => {}} txn={baseTxn} />)
}

describe('ExplainSignalDrawer – deterministic fallback rendering', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders fallback HTML when rationale is short', async () => {
    const mockShort = { rationale: 'ok', mode: 'deterministic', evidence } as unknown as ExplainResponse
    (getExplain as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(mockShort)

    renderDrawer()
    await waitFor(() => expect(screen.getByTestId('explain-drawer')).toBeTruthy())

    // Fallback badge appears
    await screen.findByText(/fallback/i)

    // Fallback explanatory paragraph text snippet
    expect(screen.getByText(/deterministic signals/i)).toBeTruthy()
    // Evidence list item from rule
    expect(screen.getByText(/Matched rule:/i)).toBeTruthy()
  })

  it('renders original rationale when content is sufficiently long', async () => {
    const longText = 'This transaction was categorized as Groceries based on prior labeling and explicit rule match.'
    const mockLong = { rationale: longText, mode: 'deterministic', evidence } as unknown as ExplainResponse
    (getExplain as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(mockLong)

  renderDrawer()
    await waitFor(() => expect(screen.getByTestId('explain-drawer')).toBeTruthy())

    // Should not show fallback chip
    expect(screen.queryByText(/fallback/i)).toBeNull()

    // Should show the long rationale verbatim
    expect(screen.getByText(longText.slice(0, 40), { exact: false })).toBeTruthy()

    // Should not render the deterministic signals paragraph
    expect(screen.queryByText(/deterministic signals/i)).toBeNull()
  })
})
