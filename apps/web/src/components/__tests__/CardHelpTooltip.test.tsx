import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CardHelpTooltip from '@/components/CardHelpTooltip';

// Mock getHelp to emulate sequential what/why responses + ETag caching markers
const calls: any[] = [];
vi.mock('@/lib/helpTooltip', () => ({
  getHelp: (args: any) => {
    calls.push(args);
    if (args.mode === 'what') {
      return Promise.resolve({ mode: 'what', source: 'deterministic', text: 'What text', etag: 'etag-what' });
    }
    return Promise.resolve({ mode: 'why', source: 'llm', text: 'Why text', etag: 'etag-why' });
  },
}));

describe('CardHelpTooltip', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Reset captured calls between tests so assertions on absence/presence are accurate
    calls.length = 0;
  });

  it('opens and fetches what help on click', async () => {
    render(<CardHelpTooltip cardId="cards.test" ctx={{ foo: 'bar' }} baseText="Base" />);
    const btn = screen.getByRole('button', { name: /card help/i });
    fireEvent.click(btn);
    await screen.findByText('What text');
    expect(screen.getByText('What text')).toBeInTheDocument();
    // Tab defaults to What
    expect(screen.getByRole('button', { name: 'What' })).toHaveClass('bg-accent');
  });

  it('switches to why tab and fetches why help', async () => {
    render(<CardHelpTooltip cardId="cards.test" ctx={{ foo: 'bar' }} baseText="Base summary" />);
    fireEvent.click(screen.getByRole('button', { name: /card help/i }));
    await screen.findByText('What text');
    const whyTab = screen.getByRole('button', { name: 'Why' });
    fireEvent.click(whyTab);
    await screen.findByText('Why text');
    expect(screen.getByText('Why text')).toBeInTheDocument();
  });

  it('shift+click opens and loads why only (lazy skip what)', async () => {
    render(<CardHelpTooltip cardId="cards.test" ctx={{}} baseText="Base" />);
    const btn = screen.getByRole('button', { name: /card help/i });
    fireEvent.click(btn, { shiftKey: true });
    await waitFor(() => {
      expect(screen.getByText('Why text')).toBeInTheDocument();
    });
    // Active tab is Why
    expect(screen.getByRole('button', { name: 'Why' })).toHaveClass('bg-accent');
    // Ensure no 'what' fetch happened
    expect(calls.find(c => c.mode === 'what')).toBeUndefined();
    expect(calls.filter(c => c.mode === 'why').length).toBe(1);
  });
});
