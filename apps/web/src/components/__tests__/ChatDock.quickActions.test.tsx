/**
 * Tests for ChatDock quick-action buttons streaming behavior.
 * Verifies that toolbar buttons call sendMessage with correct mode parameters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ChatDock from '../ChatDock';
import { useAgentStream } from '@/chat/useAgentStream';
import * as api from '@/lib/api';

// Mock dependencies
vi.mock('@/lib/api', () => ({
  agentStatus: vi.fn(),
  agentTools: {},
  analytics: {},
  telemetry: { track: vi.fn() },
}));

vi.mock('@/chat/useAgentStream', () => ({
  useAgentStream: vi.fn(),
}));

vi.mock('@/stores/chatdock', () => ({
  useChatDockStore: vi.fn(() => ({
    visible: true,
    open: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('@/context/ChatDockContext', () => ({
  ChatDockProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useChatDock: vi.fn(() => ({
    month: '2024-11',
    setMonth: vi.fn(),
  })),
}));

vi.mock('@/state/auth', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'test-user', email: 'test@example.com' },
    isAuthenticated: true,
  })),
  useShowDevTools: vi.fn(() => false),
}));

describe('ChatDock Quick Actions Streaming', () => {
  const mockSendMessage = vi.fn();
  const mockCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock healthy agent status
    vi.mocked(api.agentStatus).mockResolvedValue({
      ok: true,
      llm_ok: true,
    });

    // Setup mock useAgentStream return value
    vi.mocked(useAgentStream).mockReturnValue({
      sendMessage: mockSendMessage,
      cancel: mockCancel,
      messages: [],
      isStreaming: false,
      thinkingState: null,
      hasReceivedToken: false,
      error: null,
    });
  });

  it('Month summary button calls sendMessage with finance_quick_recap mode', async () => {
    render(<ChatDock />);

    // Find and click the Month summary button
    const monthSummaryButton = screen.getByRole('button', { name: /month summary/i });
    fireEvent.click(monthSummaryButton);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringContaining('month summary'),
      expect.objectContaining({
        mode: 'finance_quick_recap',
        month: '2024-11',
      })
    );
  });

  it('Alerts button calls sendMessage with finance_alerts mode', async () => {
    render(<ChatDock />);

    const alertsButton = screen.getByRole('button', { name: /alerts/i });
    fireEvent.click(alertsButton);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringContaining('alerts'),
      expect.objectContaining({
        mode: 'finance_alerts',
        month: '2024-11',
      })
    );
  });

  it('Recurring charges button calls sendMessage with analytics_recurring_all mode', async () => {
    render(<ChatDock />);

    const recurringButton = screen.getByRole('button', { name: /recurring/i });
    fireEvent.click(recurringButton);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringContaining('recurring'),
      expect.objectContaining({
        mode: 'analytics_recurring_all',
        month: '2024-11',
      })
    );
  });

  it('Subscriptions button calls sendMessage with analytics_subscriptions_all mode', async () => {
    render(<ChatDock />);

    const subscriptionsButton = screen.getByRole('button', { name: /subscriptions/i });
    fireEvent.click(subscriptionsButton);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.stringContaining('subscription'),
      expect.objectContaining({
        mode: 'analytics_subscriptions_all',
        month: '2024-11',
      })
    );
  });

  it('All quick action buttons use streaming (not direct API calls)', async () => {
    render(<ChatDock />);

    // Get all quick-action buttons
    const monthSummaryButton = screen.getByRole('button', { name: /month summary/i });
    const alertsButton = screen.getByRole('button', { name: /alerts/i });
    const recurringButton = screen.getByRole('button', { name: /recurring/i });
    const subscriptionsButton = screen.getByRole('button', { name: /subscriptions/i });

    // Click each button
    fireEvent.click(monthSummaryButton);
    fireEvent.click(alertsButton);
    fireEvent.click(recurringButton);
    fireEvent.click(subscriptionsButton);

    // Verify sendMessage was called 4 times (once per button)
    expect(mockSendMessage).toHaveBeenCalledTimes(4);

    // Verify each call has a mode parameter
    const calls = mockSendMessage.mock.calls;
    calls.forEach((call) => {
      expect(call[1]).toHaveProperty('mode');
      expect(call[1].mode).toBeTruthy();
    });
  });

  it('Quick action buttons pass current month to streaming', async () => {
    render(<ChatDock />);

    const monthSummaryButton = screen.getByRole('button', { name: /month summary/i });
    fireEvent.click(monthSummaryButton);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        month: '2024-11',
      })
    );
  });
});
