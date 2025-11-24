// Spend bucket helpers for consistent bar chart coloring
// Used by Top Merchants and Top Categories to match legend colors

export type SpendBucket = "low" | "mid" | "high";

export const getSpendBucket = (amount: number, max: number): SpendBucket => {
  const ratio = max <= 0 ? 0 : amount / max;

  // Thresholds match legend text (low / mid / high)
  if (ratio >= 0.66) return "high";
  if (ratio >= 0.33) return "mid";
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
