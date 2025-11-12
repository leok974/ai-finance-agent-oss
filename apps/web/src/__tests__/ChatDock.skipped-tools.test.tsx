import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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

// Mock aguiStream with the actual two-arg signature used in ChatDock
vi.mock('@/lib/aguiStream', () => {
  let lastHandlers: any = null;
  return {
    wireAguiStream: vi.fn((_params: any, handlers: any) => { lastHandlers = handlers; return () => {}; }),
    __getHandlers: () => lastHandlers,
  };
});

import Providers from '@/components/Providers'
import ChatDock from '@/components/ChatDock'
import { wireAguiStream } from '@/lib/aguiStream'

function latestHandlers(): any {
  const fn: any = wireAguiStream as any;
  const calls = fn.mock?.calls || [];
  if (!calls.length) return null;
  return calls[calls.length - 1][1];
}

describe('ChatDock — skipped tools summary', () => {
  it('renders chips and a “Skipped:” summary with prettified names', async () => {
    render(
      <Providers>
        <ChatDock />
      </Providers>
    )

    const user = userEvent.setup()
    // Open floating bubble first
    const bubble = await screen.findByRole('button', { name: /open agent chat/i });
    await user.click(bubble);
    // Click forecast quick button
    const forecastBtn = await screen.findByRole('button', { name: /^forecast$/i });
    await user.click(forecastBtn);

    await waitFor(() => expect(wireAguiStream).toHaveBeenCalledTimes(1));
    const h = latestHandlers();
    expect(h).toBeTruthy();
    await act(async () => {
      h.onStart?.({ intent: 'forecast', month: '2025-08' });
      h.onIntent?.('forecast', { intent: 'forecast' });
      h.onToolStart?.('analytics.kpis');
      h.onToolEnd?.('analytics.kpis', true);
      h.onToolStart?.('analytics.alerts');
      h.onToolEnd?.('analytics.alerts', false, 'no anomalies window');
      h.onToolStart?.('analytics.forecast.cashflow');
      h.onToolEnd?.('analytics.forecast.cashflow', false, 'not enough history');
      h.onChunk?.('Partial results; some tools were skipped.');
      h.onFinish?.();
    });

    // Locate the assistant message containing the skipped summary (scan textContent to avoid node splitting quirks)
    await waitFor(() => expect(document.body.textContent).toMatch(/Skipped/i));
    const txt = document.body.textContent || '';
    expect(txt).toMatch(/alerts/);
    expect(txt).toMatch(/forecast\.cashflow/);
  })
})
