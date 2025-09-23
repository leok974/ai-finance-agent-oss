import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('@/api', async (orig) => {
  const mod: any = await orig();
  return {
    ...mod,
    getRules: async (...a: any[]) => {
      (globalThis as any).__rules_getCalls = [ ...(globalThis as any).__rules_getCalls || [], a ];
      return {
        items: [
          {
            id: 'r1',
            display_name: 'Rule A',
            name: 'Rule A',
            when: { thresholds: { minConfidence: 0.66, budgetPercent: 25, limit: 200 }, merchant: 'STARBUCKS' },
            then: { category: 'Coffee' },
            active: true,
          },
        ],
        total: 1,
      }
    }
  }
});

import RulesPanel from '@/components/RulesPanel'
import { TooltipProvider } from '@/components/ui/tooltip'

describe('RulesPanel — thresholds badge', () => {
  beforeEach(() => { (globalThis as any).__rules_getCalls = [] })

  it('renders a badge summarizing thresholds', async () => {
  render(<TooltipProvider><RulesPanel /></TooltipProvider>)
  await waitFor(() => expect(((globalThis as any).__rules_getCalls || []).length).toBeGreaterThan(0))

    expect(await screen.findByText(/Rule A/i)).toBeInTheDocument();

    const badge = await screen.findByText(/Thresholds:.*0\.66/i)
    expect(badge.textContent).toMatch(/25%/)
    expect(badge.textContent).toMatch(/200/) // limit indicator
  });
});
