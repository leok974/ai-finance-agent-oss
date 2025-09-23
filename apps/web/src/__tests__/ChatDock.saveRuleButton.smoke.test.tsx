import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Silence AGUI streaming side-effects
vi.mock('@/lib/aguiStream', () => ({
  wireAguiStream: vi.fn(() => ({ start: () => {}, stop: () => {} })),
}));

import Providers from '@/components/Providers';
import ChatDock from '@/components/ChatDock';

describe('ChatDock — Save Rule button smoke', () => {
  beforeAll(() => {
    (globalThis as any).__FORCE_SAVE_RULE_BUTTON__ = true;
  });

  it('renders the manual Save Rule… button and opens the modal', async () => {
    render(
      <Providers>
        <ChatDock />
      </Providers>
    );

    const user = userEvent.setup();

    const btn = await screen.findByRole('button', { name: /save rule/i });
    expect(btn).toBeTruthy();

    await user.click(btn);

    const title = await screen.findByText(/save as rule/i);
    expect(title).toBeTruthy();
  });
});
