import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Minimal auth mock to avoid apiGet/apiPost calls during test
vi.mock('@/state/auth', () => ({
  useAuth: () => ({ user: { email: 'test@example.com', roles: [] } }),
  AuthProvider: ({ children }: any) => children,
  useAuthRequired: () => true,
  hasRole: () => false,
  useHasRole: () => false,
}));

vi.mock('@/lib/aguiStream', () => ({
  wireAguiStream: (_query: any, handlers: any) => {
    queueMicrotask(() => {
      handlers.onStart?.({ intent: 'what-if' });
      handlers.onChunk?.('Considering options...');
      handlers.onSuggestions?.([{ label: 'Save as rule', action: 'save_rule' }]);
      handlers.onFinish?.();
    });
    return { start: () => {}, stop: () => {} };
  }
}))

vi.mock('@/lib/api', () => {
  const saveRule = vi.fn(async () => ({ display_name: 'Auto: test rule' }));
  const transactionsNl = vi.fn(async () => ({ ok: true }));
  return {
    saveRule,
    transactionsNl,
    apiGet: vi.fn(async () => null),
    apiPost: vi.fn(async () => ({})),
    __saveRuleMock: saveRule,
  };
});

import * as apiModule from '@/lib/api';

// Force-enable AGUI path in ChatDock for this test
try {
  (import.meta as any).env = { ...(import.meta as any).env, VITE_ENABLE_AGUI: '1' };
} catch {}

import Providers from '@/components/Providers'
import ChatDock from '@/components/ChatDock'

describe('Save Rule modal integration', () => {
  it('emits suggestion, opens modal, saves rule', async () => {
    render(<Providers><ChatDock /></Providers>);
    const user = userEvent.setup();

    // Open chat panel (if a toggle exists). If not found, proceed.
    const bubble = await screen.findByRole('button', { name: /agent chat/i }).catch(() => null);
    if (bubble) await user.click(bubble);

    // Trigger a run (pressing Enter in composer with what-if phrasing)
    const composer = await screen.findByPlaceholderText(/ask/i).catch(()=> null) || await screen.findByRole('textbox');
    await user.type(composer, 'What if we cut Dining out by 10%?{enter}');

    // Open modal via manual button (simpler & deterministic)
    const manual = await screen.findByRole('button', { name: /save rule…/i });
    await user.click(manual);

    // Modal should appear (label input)
    const nameInput = await screen.findByLabelText(/rule name/i);
  expect((nameInput as HTMLInputElement).value).toMatch(/Auto:/i);

    // Submit form
  const saveBtn = await screen.findAllByRole('button', { name: /^save rule$/i }).then(btns => btns[btns.length - 1]);
    await user.click(saveBtn);

  await waitFor(() => expect((apiModule as any).saveRule).toHaveBeenCalledTimes(1));
  }, 10000);
});
