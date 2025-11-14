import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatIframe } from '../ChatIframe';
import React from 'react';

// Mock the chat session store
vi.mock('@/state/chatSession', () => ({
  useChatSession: {
    getState: () => ({
      version: 0,
      messages: [],
      sessionId: null,
    }),
    subscribe: () => () => {},
  },
}));

// Mock the init function
vi.mock('../main', () => ({
  getInit: () => ({
    apiBase: '/api',
    baseUrl: 'http://localhost',
  }),
}));

// Mock fetchJSON
vi.mock('@/lib/http', () => ({
  fetchJSON: vi.fn(),
}));

describe('ChatIframe layout', () => {
  it('renders a bounded shell with required testids', () => {
    render(<ChatIframe />);

    // Shell should exist with proper testid
    const shell = screen.getByTestId('lm-chat-iframe');
    expect(shell).toBeInTheDocument();
    expect(shell).toHaveAttribute('data-shell', 'true');
    expect(shell).toHaveClass('lm-iframe');
  });

  it('renders header with tools area', () => {
    render(<ChatIframe />);

    const header = screen.getByTestId('lm-chat-header');
    expect(header).toBeInTheDocument();
    // Header no longer has lm-tools-area class (tools are inside header now)
  });

  it('renders scrollable messages area', () => {
    render(<ChatIframe />);

    const messages = screen.getByTestId('lm-chat-messages');
    expect(messages).toBeInTheDocument();
    // Messages no longer has lm-thread class (simplified structure)
  });

  it('renders input wrapper with textarea and send button', () => {
    render(<ChatIframe />);

    const inputWrapper = screen.getByTestId('lm-chat-input-wrapper');
    expect(inputWrapper).toBeInTheDocument();
    // Input wrapper no longer has lm-composer class (simplified structure)

    const input = screen.getByTestId('chat-input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveClass('input');

    const sendBtn = screen.getByTestId('chat-send');
    expect(sendBtn).toBeInTheDocument();
    expect(sendBtn).toHaveTextContent('Send');
  });

  it('renders tools toggle button', () => {
    render(<ChatIframe />);

    const toggle = screen.getByTestId('chat-tools-toggle');
    expect(toggle).toBeInTheDocument();
    // Toggle button no longer has btn/btn--ghost classes (simplified styling)
  });

  it('shows tools area when tools are visible', () => {
    render(<ChatIframe />);

    // Tools should be visible by default (showTools starts as true)
    const toolsArea = screen.getByTestId('lm-chat-tools');
    expect(toolsArea).toBeInTheDocument();
    expect(toolsArea).toHaveClass('lm-chat-header-tools'); // New class name for header tools section
  });

  it('includes specific tool buttons with testids', () => {
    render(<ChatIframe />);

    const budgetTool = screen.getByTestId('chat-tool-budget');
    expect(budgetTool).toBeInTheDocument();
    expect(budgetTool).toHaveTextContent('Budget suggest');

    const recurringTool = screen.getByTestId('chat-tool-recurring');
    expect(recurringTool).toBeInTheDocument();
    expect(recurringTool).toHaveTextContent('Recurring');
  });
});
