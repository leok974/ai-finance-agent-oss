// Centralized base text phrases for CardHelpTooltip 'why' mode now routed through i18n.
// Legacy static map retained as fallback until all keys guaranteed in dictionaries.
import { t, type I18nKey } from '@/lib/i18n';

export const HELP_BASE_TEXT: Record<string, string> = {
  'cards.overview': 'Gives you a high-level financial health check for the selected month. Shows whether you\'re living within your means by comparing total income to total spending, with net cash flow highlighting the surplus or deficit.',
  'charts.top_categories': 'Helps you see which types of expenses dominate your budget so you know where to cut back first. Categories with the highest spend are ranked at the top, making it easy to identify your biggest cost drivers.',
  'charts.month_merchants': 'Identifies which vendors or merchants are consuming the most of your budget. Useful for spotting recurring subscriptions, frequent dining spots, or any vendor that might be draining more money than expected.',
  'charts.daily_flows': 'Highlights which specific days drive spikes in spending or income. Useful for spotting payday patterns, weekend splurges, one-off large purchases, or multi-day spending streaks that might indicate a habit.',
  'charts.spending_trends': 'Shows whether your spending is trending up or down over multiple months and if your net cash flow is consistently positive. Helps you identify seasonal patterns (like holiday spending) or gradual lifestyle inflation.',
  'cards.budgets': 'Budget performance vs configured limits for the selected month.',
  'cards.budget_recommendations': 'Automatically generated budget targets derived from historical spend patterns.',
  'cards.insights': 'Spending anomalies vs historical baselines for recent months.',
  'cards.ml_status': 'Status of the ML classification model, classes, feedback counts, and update info.',
  'cards.rule_suggestions': 'AI and mined suggestions for new categorization rules based on patterns.',
  'cards.unknowns': 'Reminds you how much of your spend is still uncategorized so you can review unknowns and improve future insights. The more transactions you categorize, the more accurate your budget reports and AI recommendations become.',
};

function i18nKey(cardId: string): I18nKey | null {
  const k = `${cardId}.base` as I18nKey;
  // We rely on compile-time assurance; runtime null only if incompatible pattern
  return k;
}

export function getHelpBaseText(cardId: string, opts?: { month?: string | null; monthsWindow?: number }): string | undefined {
  // Use t() for i18n; pass month variable when key expects it
  const key = i18nKey(cardId);
  let base: string | undefined = undefined;
  if (key) {
    // Explicit list of keys expecting month var
    const monthKeys: I18nKey[] = [
      'cards.overview.base',
      'cards.budgets.base',
      'charts.top_categories.base',
      'charts.month_merchants.base',
      'charts.daily_flows.base'
    ];
    const needsMonth = monthKeys.includes(key);
    base = t(key as I18nKey, needsMonth && opts?.month ? { month: opts.month } : undefined);
  }
  if (!base) {
    base = HELP_BASE_TEXT[cardId];
  }
  if (!base) return undefined;
  if (cardId === 'charts.spending_trends' && opts?.monthsWindow) {
    base = base.replace('recent months window', `last ${opts.monthsWindow} months`);
  }
  return base;
}
