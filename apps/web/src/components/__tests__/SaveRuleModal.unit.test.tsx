import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Stable randomUUID
const UUIDS = ['uuid-1'];
vi.stubGlobal('crypto', {
  randomUUID: () => UUIDS.shift() || 'uuid-fallback'
} as any);

// Mock api saveRule
const saveRuleMock = vi.fn(async (_body: any, _opts: any) => ({ display_name: 'Auto: Dining out cut', saved: true }));
vi.mock('@/lib/api', () => ({ saveRule: (...args: any[]) => saveRuleMock.apply(null, args as any) }));

// Mock toast to avoid console noise
vi.mock('@/lib/toast-helpers', () => ({ showToast: vi.fn() }));

import SaveRuleModal from '@/components/SaveRuleModal';

function setup() {
  const onOpenChange = vi.fn();
  render(<SaveRuleModal open={true} onOpenChange={onOpenChange} month="2025-08" scenario={'Cut "Dining out" by 10%'} defaultCategory="Dining out" />);
  return { onOpenChange };
}

describe('SaveRuleModal', () => {
  beforeEach(() => { saveRuleMock.mockClear(); });

  it('submits expected payload and closes', async () => {
    const { onOpenChange } = setup();
    const user = userEvent.setup();

    // Prefilled name should reflect scenario heuristic
    const nameInput = await screen.findByLabelText(/rule name/i) as HTMLInputElement;
  expect(nameInput.value).toMatch(/^Auto:/);

    // Fill optional fields
    const budgetPct = screen.getByLabelText(/budget %/i) as HTMLInputElement;
    const limit = screen.getByLabelText(/limit/i) as HTMLInputElement;
    await user.clear(budgetPct); await user.type(budgetPct, '25');
    await user.clear(limit); await user.type(limit, '200');

    // Submit
    const btn = screen.getByRole('button', { name: /^save rule$/i });
    await user.click(btn);

  await waitFor(() => expect(saveRuleMock).toHaveBeenCalledTimes(1));
  const [payload, opts] = saveRuleMock.mock.calls[0];

    expect(payload).toMatchObject({
      rule: {
        name: expect.stringMatching(/^Auto:/),
        when: expect.objectContaining({ scenario: expect.any(String), thresholds: expect.any(Object), category: 'Dining out' }),
        then: expect.objectContaining({ category: 'Dining out' })
      },
      month: '2025-08'
    });
    expect(opts).toEqual({ idempotencyKey: 'uuid-1' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
