import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CardHelpTooltip from '@/components/CardHelpTooltip';

// Mock fetchCardExplain and fetchAgentStatus
const explainCalls: any[] = [];
const statusCalls: any[] = [];

vi.mock('@/lib/agent/explain', () => ({
  fetchCardExplain: (args: any) => {
    explainCalls.push(args);
    return Promise.resolve({ explain: 'Why text from LLM' });
  },
}));

vi.mock('@/lib/agent/status', () => ({
  fetchAgentStatus: () => {
    statusCalls.push({});
    return Promise.resolve({ llm_ok: true });
  },
}));

vi.mock('@/state/llmStore', () => ({
  useLlmStore: () => true, // modelsOk = true
}));

describe('CardHelpTooltip', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    explainCalls.length = 0;
    statusCalls.length = 0;
  });

  it('opens and fetches what help on click', async () => {
    render(<CardHelpTooltip cardId="cards.overview" ctx={{ foo: 'bar' }} baseText="Base" />);
    const btn = screen.getByRole('button', { name: /card help/i });
    fireEvent.click(btn);
    // Wait for popover to open and display deterministic "what" text
    await waitFor(() => {
      expect(screen.getByText(/Shows total inflows/)).toBeInTheDocument();
    });
    // Tab defaults to What - find by text
    const whatButton = screen.getByText('What');
    expect(whatButton).toHaveClass('bg-accent');
  });

  it('switches to why tab and fetches why help', async () => {
    render(<CardHelpTooltip cardId="cards.overview" ctx={{ foo: 'bar' }} baseText="Base summary" />);
    fireEvent.click(screen.getByRole('button', { name: /card help/i }));
    await waitFor(() => {
      expect(screen.getByText(/Shows total inflows/)).toBeInTheDocument();
    });
    // Look for button by text content directly (translation might not be mocked)
    const whyTab = screen.getByText('Why');
    fireEvent.click(whyTab);
    await waitFor(() => {
      expect(screen.getByText('Why text from LLM')).toBeInTheDocument();
    });
  });

  it('shift+click opens and loads why only (lazy skip what)', async () => {
    render(<CardHelpTooltip cardId="cards.overview" ctx={{}} baseText="Base" />);
    const btn = screen.getByRole('button', { name: /card help/i });
    fireEvent.click(btn, { shiftKey: true });
    await waitFor(() => {
      expect(screen.getByText('Why text from LLM')).toBeInTheDocument();
    });
    // Active tab is Why - find by text instead of role+name
    const whyButton = screen.getByText('Why');
    expect(whyButton).toHaveClass('bg-accent');
    // Ensure fetchCardExplain was called once
    expect(explainCalls.length).toBe(1);
  });
});
