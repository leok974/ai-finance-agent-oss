import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import ForecastCard from '@/components/ForecastCard';
import { MonthContext } from '@/context/MonthContext';
import { analytics } from '@/lib/api';

vi.mock('@/components/ExplainButton', () => ({
  default: () => <div data-testid="explain-btn" />,
}));

// Render a simple stub for ForecastChart we can assert on
vi.mock('@/components/ForecastChart', () => ({
  default: ({ data }: any) => <div data-testid="forecast-chart">points:{Array.isArray(data?.points) ? data.points.length : 0}</div>,
}));

describe('ForecastCard UI', () => {
  it('shows CI chip and renders chart after Reset auto-run', async () => {
    const spy = vi
      .spyOn(analytics, 'forecast')
      .mockResolvedValue({ ok: true, model: 'auto', ci_alpha: 0.2, points: [{}, {}, {}] } as any);

    render(
      <MonthContext.Provider value={{ month: '2025-08', setMonth: () => {} }}>
        <ForecastCard />
      </MonthContext.Provider>
    );

    // Wait for initial auto-run render
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    // Click Reset to ensure UI flows from a user action
    const resetBtn = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetBtn);

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));

    // Chip should reflect AUTO and CI 80%
    expect(screen.getByText(/model:\s*auto/i)).toBeTruthy();
    expect(screen.getByText(/ci\s*80%/i)).toBeTruthy();

    // Chart stub should be present
    expect(screen.getByTestId('forecast-chart')).toBeTruthy();
  });
});
