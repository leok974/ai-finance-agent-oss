import { describe, it, beforeAll, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

beforeAll(() => {
  // @ts-expect-error
  globalThis.crypto = { randomUUID: () => '00000000-0000-4000-8000-000000000000' };
});

vi.mock('@/lib/schemas', () => ({ ThresholdsSchema: { parse: (x: any) => x || {} } }));

const saveRuleSpy = vi.fn(async () => ({ display_name: 'Auto: seeded' }));
vi.mock('@/api', () => ({
  saveRule: saveRuleSpy,
  testRule: vi.fn(async () => []),
  saveTrainReclassify: vi.fn(),
}));
vi.mock('@/lib/toast-helpers', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import RuleTesterPanel from '@/components/RuleTesterPanel';
import type { SeedDraft } from '@/lib/rulesSeed';

describe('RuleTesterPanel seeded month flow', () => {
  it('uses seeded month in save payload', async () => {
    render(<RuleTesterPanel />);
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

    await waitFor(() => expect(saveRuleSpy).toHaveBeenCalledTimes(1));
    const [payload, opts] = saveRuleSpy.mock.calls[0] as any;
    expect(payload).toMatchObject({
      month: '2025-08',
      rule: {
        when: { description_like: 'STARBUCKS' },
        then: { category: 'Coffee' },
      },
    });
    expect(opts?.idempotencyKey).toBe('00000000-0000-4000-8000-000000000000');
  });
});
