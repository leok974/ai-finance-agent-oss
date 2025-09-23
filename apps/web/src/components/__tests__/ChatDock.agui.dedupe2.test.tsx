import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { AuthContext } from '@/state/auth';
import { MonthContext } from '@/context/MonthContext';
import { ChatDockProvider } from '@/context/ChatDockContext';

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

describe('AG-UI: duplicate gateway/model suggestions de-dupe', () => {
  it('renders only one chip after duplicate suggestions', async () => {
    render(<Providers><ChatDock /></Providers>);
    const openBtn = await screen.findByRole('button', { name: /open agent chat/i });
    await userEvent.click(openBtn);
    const input = await screen.findByRole('textbox');
    await userEvent.type(input, 'Forecast next month{enter}');
    await waitFor(() => expect(wireAguiStream).toHaveBeenCalled());
    const h = latestHandlers();
    await act(async () => {
      h.onStart?.({ intent: 'forecast', month: '2025-08' });
      h.onIntent?.('forecast');
      h.onSuggestions?.([{ label: 'Set budget from forecast', action: 'budget_from_forecast', source: 'gateway' }]);
      h.onSuggestions?.([{ label: 'Set budget from forecast', action: 'budget_from_forecast', source: 'model' }]);
      h.onFinish?.();
    });
    const chips = screen.getAllByRole('button', { name: /Set budget from forecast/i });
    expect(chips.length).toBe(1);
  });
});
