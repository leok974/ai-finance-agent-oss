import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

beforeAll(() => {
  // @ts-expect-error
  globalThis.crypto = { randomUUID: () => '00000000-0000-4000-8000-000000000000' };
});

vi.mock('@/lib/schemas', () => ({ ThresholdsSchema: { parse: (x: any) => x || {} } }));

const saveRuleSpy = vi.fn(async () => ({ display_name: 'Auto: test rule' }));
vi.mock('@/api', () => ({
  // Only provide the pieces the component path uses during this test
  saveRule: saveRuleSpy,
  testRule: vi.fn(async () => []),
  saveTrainReclassify: vi.fn(),
}));
vi.mock('@/lib/toast-helpers', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import RuleTesterPanel from '@/components/RuleTesterPanel';

describe('RuleTesterPanel simple save', () => {
  it('calls saveRule with draft-derived payload', async () => {
    render(<RuleTesterPanel />);
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
      expect(saveRuleSpy.mock.calls.length).toBe(1);
    });
    const [payload, opts] = saveRuleSpy.mock.calls[0] as any;
    expect(payload).toMatchObject({
      rule: {
        name: expect.stringMatching(/STARBUCKS/i),
        when: { description_like: 'STARBUCKS', thresholds: { minConfidence: 0.66 } },
        then: { category: 'Coffee' },
      },
    });
    expect(opts?.idempotencyKey).toBe('00000000-0000-4000-8000-000000000000');
  });
});
