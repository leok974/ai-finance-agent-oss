/**
 * Component-level test for ChatDock launcher animation state wiring
 *
 * Verifies that open state correctly maps to --open/--closed CSS classes
 * for smooth morph animation between bubble and panel.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatDock from '../ChatDock';

// Mock dependencies
vi.mock('@/hooks/useSafePortal', () => ({
  useSafePortalReady: () => true,
}));

vi.mock('@/context/MonthContext', () => ({
  useMonth: () => ({ month: '2025-11' }),
}));

vi.mock('@/context/ChatDockContext', () => ({
  useChatDock: () => ({
    dockOpen: false,
    setDockOpen: vi.fn(),
    setAppendAssistant: vi.fn(),
    setAppendUser: vi.fn(),
  }),
}));

vi.mock('@/state/auth', () => ({
  useAuth: () => ({ user: { email: 'test@example.com' } }),
  getUserInitial: () => 'T',
  useShowDevTools: () => false,
}));

vi.mock('@/state/chatSession', () => {
  const messages: any[] = [];
  return {
    useChatSession: vi.fn(() => ({
      version: 1,
      messages,
      sessionId: 'test-session',
    })),
  };
});

vi.mock('@/lib/api', () => ({
  agentStatus: vi.fn().mockResolvedValue({ llm_ok: true }),
  agentTools: {
    chartsSummary: vi.fn().mockResolvedValue({}),
    chartsMerchants: vi.fn().mockResolvedValue({}),
  },
  agentChat: vi.fn(),
  explainTxnForChat: vi.fn(),
  agentRephrase: vi.fn(),
  analytics: vi.fn(),
  transactionsNl: vi.fn(),
  txnsQueryCsv: vi.fn(),
  txnsQuery: vi.fn(),
}));

describe('ChatDock launcher animation state', () => {
  beforeEach(() => {
    // Reset any DOM state
  });

  it('starts closed with lm-chat-launcher--closed class', async () => {
    render(<ChatDock />);

    const root = screen.getByTestId('chat-launcher-root');
    expect(root.className).toContain('lm-chat-launcher--closed');
    expect(root.className).not.toContain('lm-chat-launcher--open');
  });

  it('opens when bubble is clicked', async () => {
    render(<ChatDock />);

    const root = screen.getByTestId('chat-launcher-root');
    const toggle = screen.getByTestId('chat-toggle');

    // Initial: closed
    expect(root.className).toContain('lm-chat-launcher--closed');

    // Click to open
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(root.className).toContain('lm-chat-launcher--open');
      expect(root.className).not.toContain('lm-chat-launcher--closed');
    });
  });

  it('closes when backdrop is clicked', async () => {
    render(<ChatDock />);

    const root = screen.getByTestId('chat-launcher-root');
    const toggle = screen.getByTestId('chat-toggle');

    // Open first
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(root.className).toContain('lm-chat-launcher--open');
    });

    // Close via backdrop
    const backdrop = screen.getByTestId('chat-backdrop');
    fireEvent.click(backdrop);

    await waitFor(() => {
      expect(root.className).toContain('lm-chat-launcher--closed');
      expect(root.className).not.toContain('lm-chat-launcher--open');
    });
  });

  it('bubble, backdrop, and shell elements are present in DOM', () => {
    render(<ChatDock />);

    expect(screen.getByTestId('chat-launcher-root')).toBeInTheDocument();
    expect(screen.getByTestId('chat-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('chat-backdrop')).toBeInTheDocument();
    expect(screen.getByTestId('chat-shell')).toBeInTheDocument();
  });
});
