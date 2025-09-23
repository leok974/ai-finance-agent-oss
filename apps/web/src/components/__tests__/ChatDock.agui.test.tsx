import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthContext } from '@/state/auth';
import { MonthContext } from '@/context/MonthContext';
import { ChatDockProvider } from '@/context/ChatDockContext';

// 1) Mock the stream helper (alias path used by ChatDock)
vi.mock('@/lib/aguiStream', () => {
  let lastHandlers: any = null;
  return {
    wireAguiStream: vi.fn((_opts: any, handlers: any) => { lastHandlers = handlers; return () => {}; }),
    __getHandlers: () => lastHandlers,
  };
});

// 2) Mock global fetch (avoid network); minimal Response poly if needed
// Use globalThis for TS compatibility
(globalThis as any).fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))) as any;

// 3) Import after mocks so mocked module is used
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
  if (!calls.length) return null;
  return calls[calls.length - 1][1];
}

describe('ChatDock AG-UI (streaming via wireAguiStream mock)', () => {
  it('renders intent badge + suggestions from mocked stream', async () => {
    render(<Providers><ChatDock /></Providers>);

    // Open the dock (floating bubble)
    const openBtn = await screen.findByRole('button', { name: /open agent chat/i });
    await userEvent.click(openBtn);

    const input = await screen.findByRole('textbox');
    await userEvent.type(input, 'Forecast next month{enter}', { delay: 1 });

    await waitFor(() => expect(wireAguiStream).toHaveBeenCalledTimes(1));
    const h = latestHandlers();
    expect(h).toBeTruthy();

    await act(async () => {
      h.onStart?.({ intent: 'forecast', month: '2025-08' });
      h.onIntent?.('forecast');
    });
    // Wait for intent badge before proceeding (ensures meta applied before final assistant append)
    const badge = await waitFor(() => document.querySelector('.intent-badge')) as HTMLElement | null;
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toMatch(/Forecast/i);

    await act(async () => {
      h.onToolStart?.('analytics.forecast.cashflow');
      h.onToolEnd?.('analytics.forecast.cashflow', true);
      h.onChunk?.('Projected spend ~$2,140.');
      h.onSuggestions?.([
        { label: 'Set budget from forecast', action: 'budget_from_forecast', source: 'gateway' },
        { label: 'Compare vs last month', action: 'compare_prev', source: 'gateway' }
      ]);
      h.onFinish?.();
    });

    // Aggregated assistant message
    expect(screen.getByText(/Projected spend ~\$2,140\./i)).toBeInTheDocument();
    // Suggestion chips
    expect(await screen.findByText(/Set budget from forecast/i)).toBeInTheDocument();
    expect(await screen.findByText(/Compare vs last month/i)).toBeInTheDocument();
  });

  it('button path uses wireAguiStream with mode=forecast', async () => {
    (wireAguiStream as any).mockClear();
    render(<Providers><ChatDock /></Providers>);
    const openBtn = await screen.findByRole('button', { name: /open agent chat/i });
    await userEvent.click(openBtn);
    const btn = await screen.findByRole('button', { name: /^forecast$/i });
    await userEvent.click(btn);
    await waitFor(() => expect(wireAguiStream).toHaveBeenCalledTimes(1));
    const call = (wireAguiStream as any).mock.calls.slice(-1)[0];
    expect(call[0]).toEqual(expect.objectContaining({ mode: 'forecast' }));
    const h2 = latestHandlers();
  await act(async () => { h2.onStart?.({ intent: 'forecast', month: '2025-08' }); h2.onIntent?.('forecast'); });
  const badge2 = await waitFor(() => document.querySelector('.intent-badge')) as HTMLElement | null;
  expect(badge2?.textContent).toMatch(/Forecast/i);
  await act(async () => { h2.onFinish?.(); });
  });
});

