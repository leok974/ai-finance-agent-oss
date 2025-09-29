// Centralized base text phrases for CardHelpTooltip 'why' mode now routed through i18n.
// Legacy static map retained as fallback until all keys guaranteed in dictionaries.
import { t, type I18nKey } from '@/lib/i18n';

export const HELP_BASE_TEXT: Record<string, string> = {
  'cards.overview': 'Overview of total spend, income, and net for the selected month.',
  'charts.top_categories': 'Top spending categories ranked by amount for the selected month.',
  'charts.month_merchants': 'Top merchants ranked by spending for the selected month.',
  'charts.daily_flows': 'Daily inflows and outflows with net trend for the selected month.',
  'charts.spending_trends': 'Historical spending trend over the recent months window.',
  'cards.budgets': 'Budget performance vs configured limits for the selected month.',
  'cards.budget_recommendations': 'Automatically generated budget targets derived from historical spend patterns.',
  'cards.insights': 'Spending anomalies vs historical baselines for recent months.',
  'cards.ml_status': 'Status of the ML classification model, classes, feedback counts, and update info.',
  'cards.rule_suggestions': 'AI and mined suggestions for new categorization rules based on patterns.',
  'cards.unknowns': 'Transactions lacking a category that need review and classification.',
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
