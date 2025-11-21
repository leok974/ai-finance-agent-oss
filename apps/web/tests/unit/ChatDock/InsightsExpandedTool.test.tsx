import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { QuickChips } from '@/components/QuickChips';

describe('Insights (Q) quick chip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches chip-action event with insights_tool type', () => {
    const handler = vi.fn();
    window.addEventListener('chip-action', handler);

    const items = [
      {
        label: 'Insights (Q)',
        action: { type: 'insights_tool' as const, presetText: 'Show me expanded insights for this month.' },
      },
    ];

    render(<QuickChips items={items} />);

    const chip = screen.getByRole('button', { name: /Insights \(Q\)/i });
    fireEvent.click(chip);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      type: 'insights_tool',
      presetText: 'Show me expanded insights for this month.',
    });

    window.removeEventListener('chip-action', handler);
  });

  it('includes month in action payload when provided', () => {
    const handler = vi.fn();
    window.addEventListener('chip-action', handler);

    const items = [
      {
        label: 'Insights (Q)',
        action: {
          type: 'insights_tool' as const,
          month: '2025-11',
          presetText: 'Show me expanded insights for November 2025.',
        },
      },
    ];

    render(<QuickChips items={items} />);

    const chip = screen.getByRole('button', { name: /Insights \(Q\)/i });
    fireEvent.click(chip);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      type: 'insights_tool',
      month: '2025-11',
      presetText: 'Show me expanded insights for November 2025.',
    });

    window.removeEventListener('chip-action', handler);
  });

  it('renders chip with correct label', () => {
    const items = [
      {
        label: 'Insights (Q)',
        action: { type: 'insights_tool' as const, presetText: 'Show me expanded insights for this month.' },
      },
    ];

    render(<QuickChips items={items} />);

    expect(screen.getByRole('button', { name: /Insights \(Q\)/i })).toBeInTheDocument();
  });

  it('does not render when items array is empty', () => {
    const { container } = render(<QuickChips items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('handles multiple chips including insights', () => {
    const handler = vi.fn();
    window.addEventListener('chip-action', handler);

    const items = [
      {
        label: 'Search txns',
        action: { type: 'nl_search' as const, query: 'Starbucks', presetText: 'Starbucks' },
      },
      {
        label: 'Insights (Q)',
        action: { type: 'insights_tool' as const, presetText: 'Show me expanded insights for this month.' },
      },
    ];

    render(<QuickChips items={items} />);

    const insightsChip = screen.getByRole('button', { name: /Insights \(Q\)/i });
    fireEvent.click(insightsChip);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.type).toBe('insights_tool');

    window.removeEventListener('chip-action', handler);
  });
});
