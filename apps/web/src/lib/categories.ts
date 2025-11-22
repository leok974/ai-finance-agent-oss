/**
 * Canonical category definitions - single source of truth.
 * Matches backend categories from apps/backend/app/scripts/seed_categories.py
 */

export type CategoryKind =
  | 'income'
  | 'transfers'
  | 'housing'
  | 'transportation'
  | 'groceries'
  | 'restaurants'
  | 'coffee'
  | 'health'
  | 'medical'
  | 'subscriptions'
  | 'shopping'
  | 'games'
  | 'finance'
  | 'travel';

export interface CategoryDef {
  slug: string;
  label: string;
  icon?: string;  // icon identifier (can be extended later)
  color: string;  // hex color for charts/UI
  parent?: string; // parent slug for hierarchical categories
}

/**
 * Canonical category definitions matching backend seed_categories.py.
 * Add new categories here to make them available across the app.
 */
export const CATEGORY_DEFS: Record<string, CategoryDef> = {
  // Top-level categories
  income: {
    slug: 'income',
    label: 'Income',
    color: '#22c55e', // green-500
  },
  transfers: {
    slug: 'transfers',
    label: 'Transfers / P2P',
    icon: 'arrow-left-right',
    color: '#38bdf8', // sky-400
  },
  housing: {
    slug: 'housing',
    label: 'Housing',
    color: '#8b5cf6', // violet-500
  },
  transportation: {
    slug: 'transportation',
    label: 'Transportation',
    color: '#f59e0b', // amber-500
  },
  groceries: {
    slug: 'groceries',
    label: 'Groceries',
    color: '#10b981', // emerald-500
  },
  restaurants: {
    slug: 'restaurants',
    label: 'Restaurants',
    color: '#ef4444', // red-500
  },
  coffee: {
    slug: 'coffee',
    label: 'Coffee',
    color: '#92400e', // yellow-900
  },
  health: {
    slug: 'health',
    label: 'Health',
    color: '#ec4899', // pink-500
  },
  medical: {
    slug: 'medical',
    label: 'Medical',
    color: '#dc2626', // red-600
  },
  subscriptions: {
    slug: 'subscriptions',
    label: 'Subscriptions',
    color: '#6366f1', // indigo-500
  },
  shopping: {
    slug: 'shopping',
    label: 'Shopping',
    color: '#14b8a6', // teal-500
  },
  games: {
    slug: 'games',
    label: 'Games',
    color: '#7c3aed', // violet-600
  },
  finance: {
    slug: 'finance',
    label: 'Finance',
    color: '#64748b', // slate-500
  },
  travel: {
    slug: 'travel',
    label: 'Travel',
    color: '#0ea5e9', // sky-600
  },

  // Sub-categories (housing)
  'housing.utilities': {
    slug: 'housing.utilities',
    label: 'Utilities',
    parent: 'housing',
    color: '#8b5cf6',
  },
  'housing.utilities.internet': {
    slug: 'housing.utilities.internet',
    label: 'Internet',
    parent: 'housing.utilities',
    color: '#8b5cf6',
  },
  'housing.utilities.mobile': {
    slug: 'housing.utilities.mobile',
    label: 'Mobile',
    parent: 'housing.utilities',
    color: '#8b5cf6',
  },

  // Sub-categories (transportation)
  'transportation.fuel': {
    slug: 'transportation.fuel',
    label: 'Fuel',
    parent: 'transportation',
    color: '#f59e0b',
  },
  'transportation.public': {
    slug: 'transportation.public',
    label: 'Public Transit',
    parent: 'transportation',
    color: '#f59e0b',
  },
  'transportation.ride_hailing': {
    slug: 'transportation.ride_hailing',
    label: 'Ride Hailing',
    parent: 'transportation',
    color: '#f59e0b',
  },

  // Sub-categories (health)
  'health.pharmacy': {
    slug: 'health.pharmacy',
    label: 'Pharmacy',
    parent: 'health',
    color: '#ec4899',
  },
  'health.insurance': {
    slug: 'health.insurance',
    label: 'Insurance',
    parent: 'health',
    color: '#ec4899',
  },

  // Sub-categories (subscriptions)
  'subscriptions.streaming': {
    slug: 'subscriptions.streaming',
    label: 'Streaming',
    parent: 'subscriptions',
    color: '#6366f1',
  },
  'subscriptions.software': {
    slug: 'subscriptions.software',
    label: 'Software',
    parent: 'subscriptions',
    color: '#6366f1',
  },
  'subscriptions.storage': {
    slug: 'subscriptions.storage',
    label: 'Cloud Storage',
    parent: 'subscriptions',
    color: '#6366f1',
  },
  'subscriptions.news': {
    slug: 'subscriptions.news',
    label: 'News',
    parent: 'subscriptions',
    color: '#6366f1',
  },
  'subscriptions.gaming': {
    slug: 'subscriptions.gaming',
    label: 'Gaming',
    parent: 'subscriptions',
    color: '#6366f1',
  },

  // Sub-categories (shopping)
  'shopping.electronics': {
    slug: 'shopping.electronics',
    label: 'Electronics',
    parent: 'shopping',
    color: '#14b8a6',
  },
  'shopping.clothing': {
    slug: 'shopping.clothing',
    label: 'Clothing',
    parent: 'shopping',
    color: '#14b8a6',
  },
  'shopping.home': {
    slug: 'shopping.home',
    label: 'Home Goods',
    parent: 'shopping',
    color: '#14b8a6',
  },

  // Sub-categories (finance)
  'finance.fees': {
    slug: 'finance.fees',
    label: 'Fees',
    parent: 'finance',
    color: '#64748b',
  },
  'finance.atm': {
    slug: 'finance.atm',
    label: 'ATM',
    parent: 'finance',
    color: '#64748b',
  },

  // Sub-categories (travel)
  'travel.flights': {
    slug: 'travel.flights',
    label: 'Flights',
    parent: 'travel',
    color: '#0ea5e9',
  },
  'travel.hotels': {
    slug: 'travel.hotels',
    label: 'Hotels',
    parent: 'travel',
    color: '#0ea5e9',
  },
};

/**
 * Get category definition by slug.
 * Returns undefined if category doesn't exist.
 */
export function getCategoryDef(slug: string): CategoryDef | undefined {
  return CATEGORY_DEFS[slug];
}

/**
 * Get category label for display.
 * Falls back to slug if not found.
 */
export function getCategoryLabel(slug: string): string {
  return CATEGORY_DEFS[slug]?.label ?? slug;
}

/**
 * Get category color for charts/UI.
 * Falls back to gray if not found.
 */
export function getCategoryColor(slug: string): string {
  return CATEGORY_DEFS[slug]?.color ?? '#94a3b8'; // slate-400
}

/**
 * Get all top-level categories (no parent).
 */
export function getTopLevelCategories(): CategoryDef[] {
  return Object.values(CATEGORY_DEFS).filter((c) => !c.parent);
}

/**
 * Get all category slugs.
 */
export function getAllCategorySlugs(): string[] {
  return Object.keys(CATEGORY_DEFS);
}

/**
 * Check if a category slug exists.
 */
export function categoryExists(slug: string): boolean {
  return slug in CATEGORY_DEFS;
}

/**
 * Category options for dropdowns/selects (all categories flattened).
 */
export const CATEGORY_OPTIONS = Object.values(CATEGORY_DEFS).map((def) => ({
  slug: def.slug,
  label: def.label,
  parent: def.parent,
}));
