/// <reference types="vitest" />
/// <reference types="vite/client" />
import { describe, it, beforeEach, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Provide deterministic crypto for idempotency key path if triggered
beforeEach(() => {
  // No crypto override needed
  // Clean globals
  // @ts-ignore
  delete window.__openRuleTester;
  // Queue pending seed prior to mount
  // @ts-ignore
  window.__pendingRuleSeed = {
    name: 'If merchant contains "QUEUED"',
    when: { merchant: 'QUEUED' },
    then: { category: 'QueuedCat' },
    month: '2025-09'
  };
});

vi.mock('@/lib/schemas', () => ({ ThresholdsSchema: { parse: (x: any) => x || {} } }));

// Avoid network code paths; we only assert the queued draft populates form on mount.
vi.mock('@/api', () => ({
  saveRule: vi.fn(),
  testRule: vi.fn(async () => []),
  saveTrainReclassify: vi.fn()
}));
vi.mock('@/lib/toast-helpers', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import RuleTesterPanel from '@/components/RuleTesterPanel';
import { TooltipProvider } from '@radix-ui/react-tooltip';

/*
  This test simulates a seed arriving before the panel mounts by priming window.__pendingRuleSeed.
  On mount, the panel should consume it, open itself, and populate description/category fields.
*/

describe('RuleTesterPanel queued seed consumption', () => {
  it('opens and populates from __pendingRuleSeed on first mount', async () => {
  render(<TooltipProvider><RuleTesterPanel /></TooltipProvider>);

    // The panel renders as a portal overlay when open: look for heading
    const heading = await screen.findByRole('heading', { name: /rule tester/i });
    expect(heading).toBeInTheDocument();

    // Merchant / description_like field becomes the match input
    const matchInput = await screen.findByPlaceholderText(/case-insensitive/i);
    expect(matchInput).toHaveValue('QUEUED');

    // Category field
    const categoryField = await screen.findByPlaceholderText(/subscriptions/i);
    expect(categoryField).toHaveValue('QueuedCat');

    // Ensure queue was cleared
    // @ts-ignore (global augmentation)
    expect(window.__pendingRuleSeed).toBeNull();
  });
});
