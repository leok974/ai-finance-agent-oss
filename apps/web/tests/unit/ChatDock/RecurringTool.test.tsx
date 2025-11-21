import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { QuickChips } from '@/components/QuickChips';

describe('Recurring quick chip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches chip-action event with analytics_recurring type', () => {
    const handler = vi.fn();
    window.addEventListener('chip-action', handler);

    const items = [
      {
        label: 'Recurring',
        action: { type: 'analytics_recurring' as const, presetText: 'Show my recurring subscriptions and bills.' },
      },
    ];

    render(<QuickChips items={items} />);

    const chip = screen.getByRole('button', { name: /Recurring/i });
    fireEvent.click(chip);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      type: 'analytics_recurring',
      presetText: 'Show my recurring subscriptions and bills.',
    });

    window.removeEventListener('chip-action', handler);
  });

  it('includes month in action payload when provided', () => {
    const handler = vi.fn();
    window.addEventListener('chip-action', handler);

    const items = [
      {
        label: 'Recurring',
        action: {
          type: 'analytics_recurring' as const,
          month: '2025-11',
          presetText: 'Show my recurring subscriptions for November 2025.',
        },
      },
    ];

    render(<QuickChips items={items} />);

    const chip = screen.getByRole('button', { name: /Recurring/i });
    fireEvent.click(chip);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      type: 'analytics_recurring',
      month: '2025-11',
      presetText: 'Show my recurring subscriptions for November 2025.',
    });

    window.removeEventListener('chip-action', handler);
  });

  it('renders chip with correct label', () => {
    const items = [
      {
        label: 'Recurring',
        action: { type: 'analytics_recurring' as const, presetText: 'Show my recurring subscriptions and bills.' },
      },
    ];

    render(<QuickChips items={items} />);

    expect(screen.getByRole('button', { name: /Recurring/i })).toBeInTheDocument();
  });

  it('does not render when items array is empty', () => {
    const { container } = render(<QuickChips items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('handles multiple chips including recurring', () => {
    const handler = vi.fn();
    window.addEventListener('chip-action', handler);

    const items = [
      {
        label: 'Search txns',
        action: { type: 'nl_search' as const, query: 'Starbucks', presetText: 'Starbucks' },
      },
      {
        label: 'Recurring',
        action: { type: 'analytics_recurring' as const, presetText: 'Show my recurring subscriptions and bills.' },
      },
    ];

    render(<QuickChips items={items} />);

    const recurringChip = screen.getByRole('button', { name: /Recurring/i });
    fireEvent.click(recurringChip);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.type).toBe('analytics_recurring');

    window.removeEventListener('chip-action', handler);
  });
});
