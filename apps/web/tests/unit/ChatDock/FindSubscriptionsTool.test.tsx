import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { QuickChips } from '@/components/QuickChips';

describe('Find Subscriptions quick chip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches chip-action event with find_subscriptions type', () => {
    const handler = vi.fn();
    window.addEventListener('chip-action', handler);

    const items = [
      {
        label: 'Find subscriptions',
        action: { type: 'find_subscriptions' as const, presetText: 'Scan my transactions and find subscriptions.' },
      },
    ];

    render(<QuickChips items={items} />);

    const chip = screen.getByRole('button', { name: /Find subscriptions/i });
    fireEvent.click(chip);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      type: 'find_subscriptions',
      presetText: 'Scan my transactions and find subscriptions.',
    });

    window.removeEventListener('chip-action', handler);
  });

  it('includes month in action payload when provided', () => {
    const handler = vi.fn();
    window.addEventListener('chip-action', handler);

    const items = [
      {
        label: 'Find subscriptions',
        action: {
          type: 'find_subscriptions' as const,
          month: '2025-11',
          presetText: 'Find subscriptions for November 2025.',
        },
      },
    ];

    render(<QuickChips items={items} />);

    const chip = screen.getByRole('button', { name: /Find subscriptions/i });
    fireEvent.click(chip);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      type: 'find_subscriptions',
      month: '2025-11',
      presetText: 'Find subscriptions for November 2025.',
    });

    window.removeEventListener('chip-action', handler);
  });

  it('renders chip with correct label', () => {
    const items = [
      {
        label: 'Find subscriptions',
        action: { type: 'find_subscriptions' as const, presetText: 'Scan my transactions and find subscriptions.' },
      },
    ];

    render(<QuickChips items={items} />);

    expect(screen.getByRole('button', { name: /Find subscriptions/i })).toBeInTheDocument();
  });

  it('does not render when items array is empty', () => {
    const { container } = render(<QuickChips items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('handles multiple chips including find subscriptions', () => {
    const handler = vi.fn();
    window.addEventListener('chip-action', handler);

    const items = [
      {
        label: 'Search txns',
        action: { type: 'nl_search' as const, query: 'Starbucks', presetText: 'Starbucks' },
      },
      {
        label: 'Find subscriptions',
        action: { type: 'find_subscriptions' as const, presetText: 'Scan my transactions and find subscriptions.' },
      },
    ];

    render(<QuickChips items={items} />);

    const findSubsChip = screen.getByRole('button', { name: /Find subscriptions/i });
    fireEvent.click(findSubsChip);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.type).toBe('find_subscriptions');

    window.removeEventListener('chip-action', handler);
  });
});
