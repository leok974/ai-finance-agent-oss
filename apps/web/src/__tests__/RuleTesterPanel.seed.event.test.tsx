import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// No need to override crypto; idempotency key not asserted here.

vi.mock('@/lib/schemas', () => ({ ThresholdsSchema: { parse: (x: any) => x || {} } }));

vi.mock('@/api', () => {
  const saveRule = vi.fn(async () => ({ display_name: 'Auto: seeded' }));
  (globalThis as any).__saveRuleSpy = saveRule; // expose for assertions
  return { saveRule, testRule: vi.fn(async () => []), saveTrainReclassify: vi.fn() };
});
vi.mock('@/lib/toast-helpers', () => {
  const success = vi.fn((msg: string) => {
    const div = document.createElement('div');
    div.dataset['sonnerToast'] = 'true';
    div.textContent = msg || '';
    document.body.appendChild(div);
  });
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

describe('RuleTesterPanel seeded month flow', () => {
  it('uses seeded month in save payload', async () => {
  render(<TooltipProvider><RuleTesterPanel /></TooltipProvider>);
  await waitFor(() => expect((window as any).__openRuleTester).toBeTypeOf('function'));
    const user = userEvent.setup();

    const draft: SeedDraft = {
      name: 'If merchant contains "STARBUCKS"',
      when: { merchant: 'STARBUCKS' },
      then: { category: 'Coffee' },
      month: '2025-08',
    };
    window.dispatchEvent(new CustomEvent('ruleTester:seed', { detail: draft }));

    const btn = await screen.findByRole('button', { name: /save/i });
    await user.click(btn);

  await waitFor(() => expect((globalThis as any).__saveRuleSpy).toHaveBeenCalledTimes(1));
  const [payload, opts] = (globalThis as any).__saveRuleSpy.mock.calls[0] as any;
    expect(payload).toMatchObject({
      month: '2025-08',
      rule: {
        when: { description_like: 'STARBUCKS' },
        then: { category: 'Coffee' },
      },
    });
  expect(opts?.idempotencyKey).toBeTruthy();
  });
});
