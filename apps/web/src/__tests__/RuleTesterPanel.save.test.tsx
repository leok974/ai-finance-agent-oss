import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Do not override crypto; treat idempotency key as opaque.

vi.mock('@/lib/schemas', () => ({ ThresholdsSchema: { parse: (x: any) => x || {} } }));

vi.mock('@/api', () => {
  const saveRule = vi.fn(async () => ({ display_name: 'Auto: test rule' }));
  (globalThis as any).__saveRuleSpy = saveRule;
  return { saveRule, testRule: vi.fn(async () => []), saveTrainReclassify: vi.fn() };
});
vi.mock('@/lib/toast-helpers', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import RuleTesterPanel from '@/components/RuleTesterPanel';
import { TooltipProvider } from '@radix-ui/react-tooltip';

describe('RuleTesterPanel simple save', () => {
  it('calls saveRule with draft-derived payload', async () => {
  render(<TooltipProvider><RuleTesterPanel /></TooltipProvider>);
  await waitFor(() => expect((window as any).__openRuleTester).toBeTypeOf('function'));
    const draft = {
      name: 'If merchant contains "STARBUCKS"',
      when: { merchant: 'STARBUCKS', thresholds: { minConfidence: 0.66 } },
      then: { category: 'Coffee' },
    };
  (window as any).__openRuleTester(draft);

    const user = userEvent.setup();
    const btn = await screen.findByRole('button', { name: /save/i });
    await user.click(btn);

    await waitFor(() => {
      expect(((globalThis as any).__saveRuleSpy as any).mock.calls.length).toBe(1);
    });
    const [payload, opts] = (globalThis as any).__saveRuleSpy.mock.calls[0] as any;
    expect(payload).toMatchObject({
      rule: {
        name: expect.stringMatching(/STARBUCKS/i),
    when: { description_like: 'STARBUCKS' },
        then: { category: 'Coffee' },
      },
    });
  expect(typeof opts?.idempotencyKey).toBe('string');
  expect((opts?.idempotencyKey as string).length).toBeGreaterThan(10);
  });
});
