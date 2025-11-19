/**
 * Chart formatting utilities for consistent display across all charts.
 */

/**
 * Format a number as currency with no decimal places.
 * @param value - The numeric value to format
 * @returns Formatted currency string (e.g., "$1,234")
 */
export function formatCurrency(value: number): string {
  if (value === 0) return '$0';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

/**
 * Format an ISO date string as a short date label for chart axes.
 * @param iso - ISO date string (e.g., "2025-11-02")
 * @returns Formatted date label (e.g., "Nov 2")
 */
export function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format legend keys into human-readable labels.
 * @param key - Raw legend key (e.g., "in", "out", "net")
 * @returns Friendly label (e.g., "Income", "Spend", "Net")
 */
export function formatLegendLabel(key: string): string {
  const labels: Record<string, string> = {
    in: 'Income',
    out: 'Spend',
    net: 'Net',
  };
  return labels[key] || key;
}

/**
 * Truncate long merchant names for chart labels.
 * @param text - The merchant name to truncate
 * @param maxLength - Maximum character length (default: 20)
 * @returns Truncated string with ellipsis if needed
 */
export function truncateMerchantLabel(text: string, maxLength: number = 20): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}
