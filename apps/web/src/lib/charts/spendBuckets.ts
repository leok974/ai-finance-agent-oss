// Spend bucket helpers for consistent bar chart coloring
// Used by Top Merchants and Top Categories to match legend colors

export type SpendBucket = "low" | "mid" | "high";

/**
 * Determine spend bucket based on absolute amount thresholds.
 *
 * Thresholds:
 * - High (red): >= $1000
 * - Medium (yellow): $200 - $999
 * - Low (green): < $200
 */
export const getSpendBucket = (amount: number, _max?: number): SpendBucket => {
  const absAmount = Math.abs(amount);

  if (absAmount >= 1000) return "high";
  if (absAmount >= 200) return "mid";
  return "low";
};

// CSS variable names match legend dots
export const getSpendBucketColor = (bucket: SpendBucket): string => {
  switch (bucket) {
    case "high":
      return "var(--chart-spend-high)"; // red
    case "mid":
      return "var(--chart-spend-mid)"; // yellow
    case "low":
    default:
      return "var(--chart-spend-low)"; // green
  }
};
