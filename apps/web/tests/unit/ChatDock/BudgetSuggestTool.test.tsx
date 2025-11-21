import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { QuickChips } from '@/components/QuickChips';

describe('Budget Suggest quick chip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches chip-action event with budget_tool type', () => {
    const handler = vi.fn();
    window.addEventListener('chip-action', handler);

    const items = [
      {
        label: 'Budget Suggest',
        action: { type: 'budget_tool' as const, presetText: 'Suggest a budget based on my recent spending.' },
      },
    ];

    render(<QuickChips items={items} />);

    const chip = screen.getByRole('button', { name: /Budget Suggest/i });
    fireEvent.click(chip);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      type: 'budget_tool',
      presetText: 'Suggest a budget based on my recent spending.',
    });

    window.removeEventListener('chip-action', handler);
  });

  it('includes month in action payload when provided', () => {
    const handler = vi.fn();
    window.addEventListener('chip-action', handler);

    const items = [
      {
        label: 'Budget Suggest',
        action: {
          type: 'budget_tool' as const,
          month: '2025-11',
          presetText: 'Suggest a budget for November 2025.',
        },
      },
    ];

    render(<QuickChips items={items} />);

    const chip = screen.getByRole('button', { name: /Budget Suggest/i });
    fireEvent.click(chip);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toEqual({
      type: 'budget_tool',
      month: '2025-11',
      presetText: 'Suggest a budget for November 2025.',
    });

    window.removeEventListener('chip-action', handler);
  });

  it('renders chip with correct label', () => {
    const items = [
      {
        label: 'Budget Suggest',
        action: { type: 'budget_tool' as const, presetText: 'Suggest a budget based on my recent spending.' },
      },
    ];

    render(<QuickChips items={items} />);

    expect(screen.getByRole('button', { name: /Budget Suggest/i })).toBeInTheDocument();
  });

  it('does not render when items array is empty', () => {
    const { container } = render(<QuickChips items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('handles multiple chips including budget', () => {
    const handler = vi.fn();
    window.addEventListener('chip-action', handler);

    const items = [
      {
        label: 'Search txns',
        action: { type: 'nl_search' as const, query: 'Starbucks', presetText: 'Starbucks' },
      },
      {
        label: 'Budget Suggest',
        action: { type: 'budget_tool' as const, presetText: 'Suggest a budget based on my recent spending.' },
      },
    ];

    render(<QuickChips items={items} />);

    const budgetChip = screen.getByRole('button', { name: /Budget Suggest/i });
    fireEvent.click(budgetChip);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.type).toBe('budget_tool');

    window.removeEventListener('chip-action', handler);
  });
});
