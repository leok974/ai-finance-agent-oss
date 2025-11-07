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

vi.mock('@/lib/aguiStream', () => { let h:any; return { wireAguiStream: vi.fn((_o:any, handlers:any)=>{ h=handlers; return ()=>{}; }), __getHandlers:()=>h }; });

// Ensure fetch is mocked to avoid real network attempts
(globalThis as any).fetch = vi.fn(() => Promise.resolve(new Response('{}',{ status:200 }))) as any;

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={{ user: { email: 't@example.com', roles: [] }, authReady: true, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refresh: vi.fn(async () => true) }}>
      <MonthContext.Provider value={{ month: '2025-08', setMonth: () => {} }}>
        <ChatDockProvider>{children}</ChatDockProvider>
      </MonthContext.Provider>
    </AuthContext.Provider>
  );
}

describe('AG-UI tool error summary', () => {
  it('appends Skipped line for failed tools', async () => {
    render(<Providers><ChatDock /></Providers>);
    const open = await screen.findByRole('button', { name: /open agent chat/i });
    await userEvent.click(open);
    const input = await screen.findByRole('textbox');
    await userEvent.type(input, 'Show KPIs{enter}');
    const wag: any = (await import('@/lib/aguiStream')).wireAguiStream as any;
    const h = wag.mock.calls.slice(-1)[0][1];
    await act(async () => { h.onStart?.({ intent: 'kpis', month: '2025-08' }); });
    await act(async () => {
      h.onToolStart?.('analytics.kpis');
      h.onToolEnd?.('analytics.kpis', false, 'service unavailable');
      h.onChunk?.('Partial data…');
    });
    // allow state update for aguiTools before finish
    await new Promise(r=>setTimeout(r,0));
    await act(async () => { h.onFinish?.(); });
    const skipped = await screen.findByText(/Skipped:/i);
    expect(skipped.textContent).toMatch(/kpis/i);
  });
});
