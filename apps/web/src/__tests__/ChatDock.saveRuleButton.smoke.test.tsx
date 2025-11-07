import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock useChatSession to avoid persist middleware issues
vi.mock('@/state/chatSession', () => ({
  useChatSession: vi.fn((selector?: any) => {
    const state = {
      sessionId: 'test-session-123',
      messages: [],
      version: 0,
      clearedAt: null,
      addMessage: vi.fn(),
      clearChat: vi.fn(),
      resetSession: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

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
    // Open the panel first (bubble button with title)
    const bubble = await screen.findByRole('button', { name: /open agent chat/i });
    await user.click(bubble);
  const saveButtons = await screen.findAllByRole('button', { name: /save rule/i });
  expect(saveButtons.length).toBeGreaterThan(0);
  // Prefer the test-only button with aria-label exactly 'Save Rule…'
  const target = saveButtons.find(b => b.getAttribute('aria-label')?.toLowerCase().startsWith('save rule')) || saveButtons[0];
  await user.click(target);

    const title = await screen.findByText(/save as rule/i);
    expect(title).toBeTruthy();
  });
});
