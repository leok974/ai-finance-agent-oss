import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { expectBodyText } from '../../__tests__/utils/dom';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { AuthContext } from '@/state/auth';
import { MonthContext } from '@/context/MonthContext';
import { ChatDockProvider } from '@/context/ChatDockContext';

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

vi.mock('@/lib/aguiStream', () => {
  let handlers: any = null;
  return {
    wireAguiStream: vi.fn((_opts: any, h: any) => { handlers = h; return () => {}; }),
    __getHandlers: () => handlers,
  };
});
import ChatDock from '../ChatDock';
import { wireAguiStream } from '@/lib/aguiStream';

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={{
      user: { email: 'tester@example.com', roles: [] },
      authReady: true,
      login: vi.fn(), register: vi.fn(), logout: vi.fn(), refresh: vi.fn(async () => true)
    }}>
      <MonthContext.Provider value={{ month: '2025-08', setMonth: () => {} }}>
        <ChatDockProvider>{children}</ChatDockProvider>
      </MonthContext.Provider>
    </AuthContext.Provider>
  );
}

function latestHandlers(): any {
  const fn: any = wireAguiStream as any;
  const calls = fn.mock?.calls || [];
  return calls.length ? calls[calls.length - 1][1] : null;
}

describe('AG-UI: chat only (no tools, no suggestions)', () => {
  it('shows Chat intent badge and no suggestion chips', async () => {
    render(<Providers><ChatDock /></Providers>);
    const openBtn = await screen.findByRole('button', { name: /open agent chat/i });
    await userEvent.click(openBtn);
    const input = await screen.findByRole('textbox');
    await userEvent.type(input, 'hi{enter}');
    await waitFor(() => expect(wireAguiStream).toHaveBeenCalled());
    const h = latestHandlers();
    await act(async () => {
      h.onStart?.({ intent: 'chat', month: '2025-08' });
      h.onIntent?.('chat');
      h.onChunk?.('Hey! How can I help?');
      h.onFinish?.();
    });
    const badge = await waitFor(() => document.querySelector('.intent-badge')) as HTMLElement | null;
    expect(badge?.textContent).toMatch(/Chat/i);
  await expectBodyText(/How can I help/i);
    // Ensure no suggestion chip appears
    expect(screen.queryByRole('button', { name: /Set budget from forecast/i })).toBeNull();
  });
});
