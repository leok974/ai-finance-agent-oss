import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock API used by SuggestionPill
vi.mock('@/lib/api', async (importOriginal) => {
  const mod = await importOriginal() as typeof import('@/lib/api')
  return {
    ...mod,
    applyCategory: vi.fn().mockResolvedValue({ ok: true }),
    promoteRule: vi.fn().mockResolvedValue({ ok: true }),
    rejectSuggestion: vi.fn().mockResolvedValue({ ok: true }),
    undoRejectSuggestion: vi.fn().mockResolvedValue({ ok: true, deleted: 1 }),
  }
})

import SuggestionPill from '@/components/SuggestionPill'
import { rejectSuggestion, undoRejectSuggestion } from '@/lib/api'
import { Toaster } from '@/components/ui/toast'
import { clickToastAction, expectToast } from '@/__tests__/utils/toast'

describe('SuggestionPill — Undo flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('triggers reject and allows undo to call undo endpoint and refresh', async () => {
    const user = userEvent.setup()
    const onApplied = vi.fn()
    const onRefreshSuggestions = vi.fn()

    render(
      <>
        <Toaster />
        <SuggestionPill
          txn={{ id: 1, merchant: 'Starbucks', description: 'Latte', amount: -4.5 }}
          s={{ category_slug: 'coffee', label: 'Coffee', score: 0.9, why: ['merchant match'] }}
          isAdmin={false}
          onApplied={onApplied}
          onRefreshSuggestions={onRefreshSuggestions}
        />
      </>
    )

    // Open menu
    await user.click(screen.getByRole('button', { name: /more/i }))
    // Click "Don’t suggest this"
    await user.click(screen.getByRole('menuitem', { name: /don’t suggest this/i }))

    expect(rejectSuggestion).toHaveBeenCalledTimes(1)

  // Toast should appear with i18n message 'Ignored {merchant} → {category}'
  await expectToast(/ignored\s+starbucks\s+.*coffee/i)

    // Click Undo in toast, which should call undo endpoint and refresh suggestions
    await clickToastAction(/undo/i)

    expect(undoRejectSuggestion).toHaveBeenCalledTimes(1)
    expect(onRefreshSuggestions).toHaveBeenCalledTimes(2) // once after reject, once after undo
  })
})
