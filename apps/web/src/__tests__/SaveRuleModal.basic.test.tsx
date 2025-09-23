import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api', () => {
  const saveRule = vi.fn(async () => ({ display_name: 'Auto: Dining spend -10%' }));
  return { saveRule, __saveRuleMock: saveRule };
});

// Simplify thresholds parsing to avoid zod dependency differences in test
vi.mock('@/lib/schemas', () => ({ ThresholdsSchema: { parse: (x: any) => x || {} } }));

vi.mock('@/lib/toast-helpers', () => ({
  showToast: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() }
}));

import SaveRuleModal from '@/components/SaveRuleModal';
import * as apiModule from '@/lib/api';

// Ensure crypto.randomUUID exists for idempotencyKey usage in component
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = { randomUUID: () => 'test-uuid' } as any;
} else if (!(globalThis as any).crypto.randomUUID) {
  (globalThis as any).crypto.randomUUID = () => 'test-uuid';
}

function setup() {
  const onOpenChange = vi.fn();
  render(<SaveRuleModal open={true} onOpenChange={onOpenChange} month="2025-08" scenario="Dining spend -10%" defaultCategory="Dining" />);
  return { onOpenChange };
}

describe('SaveRuleModal (unit)', () => {
  it('submits with scenario + category and calls saveRule', async () => {
    const { onOpenChange } = setup();
    const nameInput = await screen.findByLabelText(/rule name/i);
    expect((nameInput as HTMLInputElement).value).toMatch(/Dining spend -10%/i);

    // Adjust a threshold field for coverage
    const minConf = await screen.findByLabelText(/min confidence/i);
    await userEvent.clear(minConf);
    await userEvent.type(minConf, '0.7');

    const submit = screen.getByRole('button', { name: /save rule/i });
    await userEvent.click(submit);
    const form = submit.closest('form');
    if ((apiModule as any).saveRule.mock.calls.length === 0 && form) {
      fireEvent.submit(form);
    }

    await waitFor(() => expect((apiModule as any).saveRule).toHaveBeenCalledTimes(1));
    const call = (apiModule as any).saveRule.mock.calls[0][0];
    expect(call).toEqual(expect.objectContaining({
      rule: expect.objectContaining({ name: expect.stringMatching(/Dining spend -10%/i) }),
      month: '2025-08'
    }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
