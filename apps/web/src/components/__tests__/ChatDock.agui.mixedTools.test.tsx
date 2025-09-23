import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';

// Mock using the same alias path ChatDock uses so the real stream impl is never invoked
vi.mock('@/lib/aguiStream', () => {
  let h: any;
  return {
    wireAguiStream: vi.fn((_o: any, handlers: any) => { h = handlers; return () => {}; }),
    __getHandlers: () => h,
  };
});

// Avoid any accidental real network fetch
(globalThis as any).fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))) as any;

import ChatDock from '../ChatDock';
import { AuthContext } from '@/state/auth';
import { MonthContext } from '@/context/MonthContext';
import { ChatDockProvider } from '@/context/ChatDockContext';
import { wireAguiStream } from '@/lib/aguiStream';

function latestHandlers(): any {
  const fn: any = wireAguiStream as any;
  const calls = fn.mock?.calls || [];
  return calls.length ? calls[calls.length - 1][1] : null;
}

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

describe('AG-UI: mixed tool success/failure', () => {
  it('renders Skipped line with prettified analytics.* name', async () => {
    render(<Providers><ChatDock /></Providers>);

    // Open floating bubble first
    const openBtn = await screen.findByRole('button', { name: /open agent chat/i });
    await userEvent.click(openBtn);

    const input = await screen.findByRole('textbox');
    await userEvent.type(input, 'Overview{enter}', { delay: 1 });

    await waitFor(() => expect(wireAguiStream).toHaveBeenCalledTimes(1));
    const h = latestHandlers();
    expect(h).toBeTruthy();

    await act(async () => {
      h.onStart?.({ intent: 'overview', month: '2025-08' });
      h.onIntent?.('overview');
      h.onToolStart?.('analytics.forecast.cashflow');
      h.onToolEnd?.('analytics.forecast.cashflow', true);
      h.onToolStart?.('analytics.kpis');
      h.onToolEnd?.('analytics.kpis', false, 'service unavailable');
      h.onChunk?.('Here is your overview…');
    });
    // Allow React effect updating aguiToolsRef to run before finish snapshot
    await new Promise(r => setTimeout(r, 0));
    await act(async () => { h.onFinish?.(); });

  // Intent badge/message content (select specific badge to avoid multiple matches)
  const badge = await waitFor(() => document.querySelector('.intent-badge')) as HTMLElement | null;
  expect(badge).toBeTruthy();
  expect(badge?.textContent).toMatch(/Overview/i);
    // Skipped summary + prettified tool name (KPI)
    const skipped = await screen.findByText(/Skipped:/i);
    expect(skipped).toBeInTheDocument();
    // prettyToolName only strips prefixes; analytics.kpis -> kpis
    expect(skipped.textContent).toMatch(/kpis/i);
  });
});
