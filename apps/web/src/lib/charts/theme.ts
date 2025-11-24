/**
 * Shared chart color theme for LedgerMind.
 *
 * Ensures consistency between chart visuals and legends by using
 * CSS custom properties that match the design system.
 */

// Series colors for income/spend/net flows
export const SERIES_COLORS = {
  spend: 'var(--lm-chart-spend)',      // red
  income: 'var(--lm-chart-income)',    // green
  net: 'var(--lm-chart-net)',          // blue
};

// Category colors matching legend and design system
// Demo CSV categories (generate_demo_csv.py): income_salary, income_other, rent,
// groceries, restaurants, subscriptions_software, subscriptions_media, fuel,
// transfers, shopping_online, entertainment_games, health
export const CATEGORY_COLORS: Record<string, string> = {
  groceries: 'var(--lm-chart-groceries)',
  restaurants: 'var(--lm-chart-restaurants)',
  rent: 'var(--lm-chart-housing)',
  fuel: 'var(--lm-chart-transport)',
  subscriptions: 'var(--lm-chart-subscriptions)',
  'subscriptions.software': 'var(--lm-chart-subscriptions)',
  subscriptions_software: 'var(--lm-chart-subscriptions)',
  'subscriptions.streaming': 'var(--lm-chart-entertainment)',
  'subscriptions.media': 'var(--lm-chart-entertainment)',
  subscriptions_media: 'var(--lm-chart-entertainment)',
  'income.salary': 'var(--lm-chart-income)',
  income_salary: 'var(--lm-chart-income)',
  'income.other': 'var(--lm-chart-income)',
  income_other: 'var(--lm-chart-income)',
  'entertainment.games': 'var(--lm-chart-games)',
  entertainment_games: 'var(--lm-chart-games)',
  'shopping.online': 'var(--lm-chart-shopping)',
  shopping_online: 'var(--lm-chart-shopping)',
  'housing.rent': 'var(--lm-chart-housing)',
  transport: 'var(--lm-chart-transport)',
  transportation: 'var(--lm-chart-transport)', // alias
  'transportation.fuel': 'var(--lm-chart-transport)',
  entertainment: 'var(--lm-chart-entertainment)',
  utilities: 'var(--lm-chart-utilities)',
  health: 'var(--lm-chart-health)',
  shopping: 'var(--lm-chart-shopping)',
  travel: 'var(--lm-chart-travel)',
  housing: 'var(--lm-chart-housing)',
  finance: 'var(--lm-chart-finance)',
  transfers: 'var(--lm-chart-transfers)',
  games: 'var(--lm-chart-games)',
  coffee: 'var(--lm-chart-coffee)',
  other: 'var(--lm-chart-other)',
  unknown: 'var(--lm-chart-unknown)',
};

/**
 * Get the fill color for a category, with fallback to 'other' or 'unknown'.
 *
 * @param categorySlug - Category slug (e.g., 'groceries', 'restaurants')
 * @returns CSS color variable string
 */
export function getCategoryColor(categorySlug: string | null | undefined): string {
  if (!categorySlug) {
    return CATEGORY_COLORS.unknown ?? 'hsl(var(--muted))';
  }

  const normalized = categorySlug.toString().trim().toLowerCase();

  return (
    CATEGORY_COLORS[normalized] ??
    CATEGORY_COLORS.other ??
    CATEGORY_COLORS.unknown ??
    'hsl(var(--muted))'
  );
}
