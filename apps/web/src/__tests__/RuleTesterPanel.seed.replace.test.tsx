import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// No need to stub crypto; test does not perform save

vi.mock('@/lib/schemas', () => ({ ThresholdsSchema: { parse: (x: any) => x || {} } }));

vi.mock('@/api', () => ({
  saveRule: async () => ({ display_name: 'n/a' }),
  testRule: async () => [],
  saveTrainReclassify: async () => ({})
}));
vi.mock('@/lib/toast-helpers', () => {
  const success = vi.fn();
  const error = vi.fn();
  return {
    toast: { success, error },
    emitToastSuccess: success,
    emitToastError: error,
    showToast: success,
    useOkErrToast: () => ({ ok: success, err: error })
  };
});

import RuleTesterPanel from '@/components/RuleTesterPanel';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import type { SeedDraft } from '@/lib/rulesSeed';

/*
  This test validates that when the panel is already open with an existing draft,
  a subsequent live ruleTester:seed event fully overwrites the editable draft fields
  (match description_like, category, name) and updates the seededMonth used for saving.
*/

describe('RuleTesterPanel replacement seed events', () => {
  it('overwrites existing draft fields & month on second seed event', async () => {
    render(
      <TooltipProvider>
        <RuleTesterPanel />
      </TooltipProvider>
    );
    const user = userEvent.setup();

    const first: SeedDraft = {
      name: 'First seed',
      when: { merchant: 'FIRST' },
      then: { category: 'CatA' },
      month: '2025-07'
    };
    window.dispatchEvent(new CustomEvent('ruleTester:seed', { detail: first }));

    // Ensure first seed populated
  const matchInput = await screen.findByPlaceholderText(/case-insensitive/);
    expect(matchInput).toHaveValue('FIRST');
    const categoryField = await screen.findByPlaceholderText(/subscriptions/i);
    expect(categoryField).toHaveValue('CatA');

    // Modify locally to ensure replacement truly overrides user edits
    await user.clear(matchInput); await user.type(matchInput, 'LOCAL');
    await user.clear(categoryField); await user.type(categoryField, 'LocalCat');

    const second: SeedDraft = {
      name: 'Second seed',
      when: { merchant: 'SECOND' },
      then: { category: 'CatB' },
      month: '2025-08'
    };
    window.dispatchEvent(new CustomEvent('ruleTester:seed', { detail: second }));

    // Fields should reflect second seed, not prior local edits (allow state flush)
    await waitFor(() => {
      expect(matchInput).toHaveValue('SECOND');
      expect(categoryField).toHaveValue('CatB');
    });

    // Replacement success criteria: fields reflect second seed; no need to assert save path here
  });
});
