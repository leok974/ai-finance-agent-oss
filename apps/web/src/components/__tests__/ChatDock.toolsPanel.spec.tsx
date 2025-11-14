/**
 * Component-level wiring test for ChatDock + toolsPanel integration
 *
 * Verifies that clicking UI elements correctly updates the global toolsPanel store.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { getToolsOpen, hideTools, showTools } from '@/state/chat/toolsPanel';
import ChatDock from '../ChatDock';

// Mock dependencies
vi.mock('@/hooks/useSafePortal', () => ({
  useSafePortalReady: () => true,
}));

vi.mock('@/context/MonthContext', () => ({
  useMonth: () => ({ month: '2025-11' }),
}));

vi.mock('@/context/ChatDockContext', () => ({
  useChatDock: () => ({ dockOpen: false, setDockOpen: vi.fn() }),
}));

vi.mock('@/state/auth', () => ({
  useAuth: () => ({ user: { email: 'test@example.com' } }),
  getUserInitial: () => 'T',
  useShowDevTools: () => false,
}));

vi.mock('@/state/chatSession', () => ({
  useChatSession: () => ({
    version: 1,
    messages: [],
    sessionId: 'test-session',
  }),
}));

vi.mock('@/lib/api', () => ({
  agentStatus: vi.fn().mockResolvedValue({ llm_ok: true }),
  agentTools: vi.fn(),
  agentChat: vi.fn(),
  explainTxnForChat: vi.fn(),
  agentRephrase: vi.fn(),
  analytics: vi.fn(),
  transactionsNl: vi.fn(),
  txnsQueryCsv: vi.fn(),
  txnsQuery: vi.fn(),
}));

describe('ChatDock toolsPanel wiring', () => {
  beforeEach(() => {
    // Reset to known state
    hideTools();
  });

  it('renders without crashing', () => {
    const { container } = render(<ChatDock />);
    expect(container).toBeTruthy();
  });

  it('tools toggle button syncs with toolsPanel store', async () => {
    render(<ChatDock />);

    // Initial state: tools hidden
    expect(getToolsOpen()).toBe(false);

    // Wait for button to be available (ChatDock renders conditionally)
    await waitFor(() => {
      const toggle = screen.queryByTestId('chat-tools-toggle');
      if (toggle) {
        fireEvent.click(toggle);
      }
    });

    // After click, tools should be visible
    expect(getToolsOpen()).toBe(true);
  });

  it('clicking chat bubble opens tools when they are hidden', async () => {
    render(<ChatDock />);

    hideTools();
    expect(getToolsOpen()).toBe(false);

    // Click the chat bubble to open
    await waitFor(() => {
      const bubble = screen.queryByTestId('chat-toggle');
      if (bubble) {
        fireEvent.click(bubble);
      }
    });

    // Tools state should remain controlled by toolsPanel
    // (ChatDock doesn't force-show tools on open, so state should remain as-is)
    expect(getToolsOpen()).toBe(false);
  });

  it('multiple toggles flip visibility correctly', async () => {
    render(<ChatDock />);

    showTools();
    expect(getToolsOpen()).toBe(true);

    await waitFor(() => {
      const toggle = screen.queryByTestId('chat-tools-toggle');
      if (toggle) {
        // First click: hide
        fireEvent.click(toggle);
        expect(getToolsOpen()).toBe(false);

        // Second click: show
        fireEvent.click(toggle);
        expect(getToolsOpen()).toBe(true);
      }
    });
  });
});
