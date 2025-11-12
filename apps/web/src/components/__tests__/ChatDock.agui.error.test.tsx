import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatDock from '../ChatDock';
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
  let h: any; return {
    wireAguiStream: vi.fn((_o: any, handlers: any) => { h = handlers; return () => {}; }),
    __getHandlers: () => h,
  };
});

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={{ user: { email: 't@example.com', roles: [] }, authReady: true, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refresh: vi.fn(async () => true) }}>
      <MonthContext.Provider value={{ month: '2025-08', setMonth: () => {} }}>
        <ChatDockProvider>{children}</ChatDockProvider>
      </MonthContext.Provider>
    </AuthContext.Provider>
  );
}

describe('AG-UI error fallback', () => {
  it('marks fallback on onError', async () => {
    render(<Providers><ChatDock /></Providers>);
    const open = await screen.findByRole('button', { name: /open agent chat/i });
    await userEvent.click(open);
    const input = await screen.findByRole('textbox');
    await userEvent.type(input, 'hi{enter}');
  const wag: any = (await import('@/lib/aguiStream')).wireAguiStream as any;
  const calls = wag.mock.calls;
  const h = calls[calls.length - 1][1];
  expect(h).toBeTruthy();
    await act(async () => {
      h.onStart?.({ intent: 'chat', month: '2025-08' });
      h.onError?.(new Error('boom'));
    });
    expect(await screen.findByText(/fallback/i)).toBeInTheDocument();
  });
});
