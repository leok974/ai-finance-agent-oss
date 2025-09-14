import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HelpBadge from '@/components/HelpBadge';

// Mock useExplain to capture calls
vi.mock('@/hooks/useExplain', () => {
  const explain = vi.fn();
  return {
    useExplain: () => ({ open: false, setOpen: vi.fn(), loading: false, text: '', explain }),
  };
});

describe('HelpBadge', () => {
  it('calls explain on click', async () => {
    render(<HelpBadge k="cards.month_summary" month="2025-08" />);
    const btn = screen.getByRole('button', { name: /explain this/i });
    fireEvent.click(btn);

    const { useExplain } = await import('@/hooks/useExplain');
    const hook = useExplain();
    expect((hook.explain as any)).toHaveBeenCalledWith('cards.month_summary', { month: '2025-08', withContext: true });
  });

  it('dispatches toggle event on shift+click', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<HelpBadge k="cards.month_summary" />);
    const btn = screen.getAllByRole('button', { name: /explain this/i })[0];
    fireEvent.click(btn, { shiftKey: true });
    await waitFor(() => {
      expect(dispatchSpy).toHaveBeenCalled();
      const evt = (dispatchSpy.mock.calls[0]?.[0]) as Event;
      expect(evt?.type).toBe('help-mode:toggle');
    });
  });
});
