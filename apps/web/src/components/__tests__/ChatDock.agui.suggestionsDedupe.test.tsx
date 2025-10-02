import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatDock from '../ChatDock';
import { AuthContext } from '@/state/auth';
import { MonthContext } from '@/context/MonthContext';
import { ChatDockProvider } from '@/context/ChatDockContext';

vi.mock('@/lib/aguiStream', () => { let h:any; return { wireAguiStream: vi.fn((_o:any, handlers:any)=>{ h=handlers; return ()=>{}; }), __getHandlers:()=>h }; });

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={{ user: { email: 't@example.com', roles: [] }, authReady: true, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refresh: vi.fn(async () => true) }}>
      <MonthContext.Provider value={{ month: '2025-08', setMonth: () => {} }}>
        <ChatDockProvider>{children}</ChatDockProvider>
      </MonthContext.Provider>
    </AuthContext.Provider>
  );
}

describe('AG-UI suggestions de-dupe', () => {
  it('renders one chip for duplicate model+gateway suggestion', async () => {
    render(<Providers><ChatDock /></Providers>);
    const open = await screen.findByRole('button', { name: /open agent chat/i });
    await userEvent.click(open);
    const input = await screen.findByRole('textbox');
    await userEvent.type(input, 'Forecast next month{enter}');
    const wag: any = (await import('@/lib/aguiStream')).wireAguiStream as any;
    const h = wag.mock.calls.slice(-1)[0][1];
    await act(async () => {
      h.onStart?.({ intent: 'forecast', month: '2025-08' });
      // gateway suggestions
      h.onSuggestions?.([{ label: 'Set budget from forecast', action: 'budget_from_forecast', source: 'gateway' }]);
      // Simulate model suggestions merging via pushAssistant (reuse gateway path by mutating store)
      // We directly set a model suggestion through the chatResp meta adaptation path by appending assistant with suggestionsLLM semantics is complex; instead
      // emulate duplicate insertion then rely on de-dupe logic (second onSuggestions with same chip)
      h.onSuggestions?.([{ label: 'Set budget from forecast', action: 'budget_from_forecast', source: 'model' }]);
      h.onFinish?.();
    });
    const chips = screen.getAllByText(/Set budget from forecast/i);
    expect(chips.length).toBe(1);
  });
});
