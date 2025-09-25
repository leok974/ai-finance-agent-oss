export type HelpEntry = { title: string; body: string };

export const helpRegistry = {
  "anomalies.month": {
    title: "Unusual this month",
    body: "Highlights categories whose spend deviates from their trailing baseline. Click a bar to jump to details.",
  },
  "overview.metrics.totalSpend": {
    title: "Total Spend",
    body: "Sum of all negative amounts in the selected period, after refunds are applied.",
  },
  "cards.unknowns": {
    title: "Uncategorized transactions",
    body: "Transactions without a category. Use 'Seed rule' to draft a rule in the tester, then apply categories quickly.",
  },
  "cards.ml_status": {
    title: "ML Status",
    body: "Shows learned classes and feedback count. Run Selftest to verify incremental learning end-to-end.",
  },
  "card.forecast": {
    title: "Forecast",
    body: "Run time-series forecasts with SARIMAX or EMA. Adjust horizon and confidence interval to explore scenarios.",
  },
  "cards.insights": {
    title: "Unusual this month",
    body: "Highlights categories unusually high or low vs the median of recent months.",
  },
  "cards.insights_list": {
    title: "Insights",
    body: "A list of narrative insights generated from your data. Items may link to charts or details.",
  },
  // Add more keys as you wire targets
} as const;

export type HelpKey = keyof typeof helpRegistry;

export const DEFAULT_HELP: HelpEntry = {
  title: "Overview",
  body: "Click a highlighted card to see its specific explanation.",
};
