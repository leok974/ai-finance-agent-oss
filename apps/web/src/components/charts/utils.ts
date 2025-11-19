/**
 * Shared chart utilities for consistent styling across all money charts.
 */

import type { YAxisProps } from 'recharts';

/**
 * Format money value for chart tick labels with compact notation.
 * @param value - The numeric value to format
 * @returns Compact currency string (e.g., "$1.2k", "$850")
 */
export const formatMoneyTick = (value: number): string => {
  if (!Number.isFinite(value)) return '';

  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(1)}k`;
  }

  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
};

/**
 * Shared Y-axis props for all money-based charts.
 * Provides consistent styling: compact width, no tick/axis lines, readable font.
 */
export const MONEY_Y_AXIS_PROPS: YAxisProps = {
  width: 60,
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: 'var(--lm-chart-axis)' },
  tickFormatter: formatMoneyTick,
};
