import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import ForecastCard from '@/components/ForecastCard';
import { MonthContext } from '@/context/MonthContext';
import { analytics } from '@/lib/api';

// Keep the test focused: stub heavy subcomponents
vi.mock('@/components/ExplainButton', () => ({
  default: () => <div data-testid="explain-btn" />,
}));
vi.mock('@/components/ForecastChart', () => ({
  default: () => <div data-testid="forecast-chart" />,
}));

describe('ForecastCard Reset auto-run', () => {
  it('calls analytics.forecast with defaults after Reset', async () => {
    const spy = vi
      .spyOn(analytics, 'forecast')
      .mockResolvedValue({ ok: true, model: 'auto', ci_alpha: 0.2, points: [] } as any);

    render(
      <MonthContext.Provider value={{ month: '2025-08', setMonth: () => {} }}>
        <ForecastCard />
      </MonthContext.Provider>
    );

    // Initial auto-run once on mount
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    // Click Reset and expect another call with default params
    const resetBtn = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetBtn);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

  const last = spy.mock.calls[spy.mock.calls.length - 1]!;
  const [calledMonth, calledHorizon, opts] = last as unknown as [string, number, any];
    expect(calledMonth).toBe('2025-08');
    expect(calledHorizon).toBe(3);
    expect(opts).toEqual(expect.objectContaining({ model: 'auto', ciLevel: 0.8 }));
  });
});
