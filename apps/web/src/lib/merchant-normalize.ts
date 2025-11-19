/**
 * Merchant normalization utilities for displaying clean brand names.
 * Matches backend brand rules from apps/backend/app/services/charts_data.py
 */

export type MerchantKind = 'p2p' | 'subscription' | 'retail' | 'atm' | 'cash';

export type MerchantBrandRule = {
  key: string;
  label: string;
  patterns: string[];
  kind?: MerchantKind;
  categoryHint?: string; // category slug from CATEGORY_DEFS
};

export type MerchantNormalized = {
  display: string;
  kind?: MerchantKind;
  categoryHint?: string;
};

/**
 * Brand rules matching backend MERCHANT_BRAND_RULES configuration.
 * Add new rules here as you discover noisy merchant patterns.
 */
const MERCHANT_BRAND_RULES: MerchantBrandRule[] = [
  // === P2P / Transfers ===
  {
    key: 'zelle',
    label: 'Zelle transfer',
    patterns: ['now withdrawal', 'zelle payment', 'zelle transfer', 'zelle'],
    kind: 'p2p',
    categoryHint: 'transfers',
  },
  {
    key: 'venmo',
    label: 'Venmo',
    patterns: ['venmo'],
    kind: 'p2p',
    categoryHint: 'transfers',
  },
  {
    key: 'cash_app',
    label: 'Cash App',
    patterns: ['sqc*', 'cash app', 'square cash'],
    kind: 'p2p',
    categoryHint: 'transfers',
  },
  {
    key: 'paypal_p2p',
    label: 'PayPal',
    patterns: ['paypal'],
    kind: 'p2p',
    categoryHint: 'transfers',
  },
  {
    key: 'apple_cash',
    label: 'Apple Cash',
    patterns: ['apple cash'],
    kind: 'p2p',
    categoryHint: 'transfers',
  },

  // === Subscriptions ===
  {
    key: 'playstation',
    label: 'PlayStation',
    patterns: ['playstatio', 'playstation'],
    kind: 'subscription',
    categoryHint: 'subscriptions.gaming',
  },
  {
    key: 'netflix',
    label: 'Netflix',
    patterns: ['netflix'],
    kind: 'subscription',
    categoryHint: 'subscriptions.streaming',
  },
  {
    key: 'spotify',
    label: 'Spotify',
    patterns: ['spotify'],
    kind: 'subscription',
    categoryHint: 'subscriptions.streaming',
  },
  {
    key: 'github',
    label: 'GitHub',
    patterns: ['github'],
    kind: 'subscription',
    categoryHint: 'subscriptions.software',
  },
  {
    key: 'apple',
    label: 'Apple',
    patterns: ['apple.com', 'apple '],
    kind: 'subscription',
  },
  {
    key: 'google',
    label: 'Google',
    patterns: ['google'],
    kind: 'subscription',
  },
  {
    key: 'microsoft',
    label: 'Microsoft',
    patterns: ['microsoft'],
    kind: 'subscription',
    categoryHint: 'subscriptions.software',
  },
  {
    key: 'adobe',
    label: 'Adobe',
    patterns: ['adobe'],
    kind: 'subscription',
    categoryHint: 'subscriptions.software',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    patterns: ['linkedin'],
    kind: 'subscription',
  },

  // === Retail / Groceries ===
  {
    key: 'harris_teeter',
    label: 'Harris Teeter',
    patterns: ['harris teeter'],
    kind: 'retail',
    categoryHint: 'groceries',
  },
  {
    key: 'target',
    label: 'Target',
    patterns: ['target'],
    kind: 'retail',
    categoryHint: 'shopping',
  },
  {
    key: 'walmart',
    label: 'Walmart',
    patterns: ['walmart'],
    kind: 'retail',
    categoryHint: 'shopping',
  },
  {
    key: 'cvs',
    label: 'CVS Pharmacy',
    patterns: ['cvs'],
    kind: 'retail',
    categoryHint: 'health.pharmacy',
  },
  {
    key: 'walgreens',
    label: 'Walgreens',
    patterns: ['walgreens'],
    kind: 'retail',
    categoryHint: 'health.pharmacy',
  },
  {
    key: 'amazon',
    label: 'Amazon',
    patterns: ['amazon'],
    kind: 'retail',
    categoryHint: 'shopping',
  },
  {
    key: 'starbucks',
    label: 'Starbucks',
    patterns: ['starbucks'],
    kind: 'retail',
    categoryHint: 'coffee',
  },

  // === Transportation ===
  {
    key: 'uber',
    label: 'Uber',
    patterns: ['uber'],
    kind: 'retail',
    categoryHint: 'transportation.ride_hailing',
  },
  {
    key: 'lyft',
    label: 'Lyft',
    patterns: ['lyft'],
    kind: 'retail',
    categoryHint: 'transportation.ride_hailing',
  },
  {
    key: 'doordash',
    label: 'DoorDash',
    patterns: ['doordash'],
    kind: 'retail',
    categoryHint: 'restaurants',
  },

  // === Misc (no category hint - needs context) ===
  {
    key: 'now_withdrawal',
    label: 'NOW Withdrawal',
    patterns: ['now withdrawal'],
  },
];

/**
 * Base merchant normalization - brand-agnostic.
 * Strips digits, punctuation, and normalizes spacing.
 */
function normalizeMerchantBase(raw: string): string {
  if (!raw) return 'unknown';

  let s = raw.toLowerCase();

  // Strip digits / punctuation / duplicate spaces
  s = s.replace(/\d+/g, ' ');
  s = s.replace(/[^a-z& ]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  return s || raw.toLowerCase();
}

/**
 * Normalize merchant name for display with brand recognition.
 * Returns structured data including display name, kind, and category hint.
 *
 * @param raw - Raw merchant string from bank statement
 * @returns Normalized merchant data with display name, kind, and category hint
 */
export function normalizeMerchant(raw: string): MerchantNormalized {
  const base = normalizeMerchantBase(raw);

  // Try brand rules first
  for (const rule of MERCHANT_BRAND_RULES) {
    if (rule.patterns.some((pattern) => base.includes(pattern))) {
      return {
        display: rule.label,
        kind: rule.kind,
        categoryHint: rule.categoryHint,
      };
    }
  }

  // Generic fallback for unknown merchants
  const label = base.charAt(0).toUpperCase() + base.slice(1);
  const display = label.length > 32 ? label.slice(0, 29) + '...' : label;

  return {
    display,
    kind: undefined,
    categoryHint: undefined,
  };
}

/**
 * Legacy function for backward compatibility.
 * Returns only the display name string.
 *
 * @deprecated Use normalizeMerchant() instead for full structured data
 */
export function normalizeMerchantForDisplay(raw: string): string {
  return normalizeMerchant(raw).display;
}

/**
 * Get canonical key for a merchant (for grouping/deduplication).
 *
 * @param raw - Raw merchant string from bank statement
 * @returns Canonical key (lowercase, normalized)
 */
export function getMerchantCanonicalKey(raw: string): string {
  const base = normalizeMerchantBase(raw);

  // Try brand rules first
  for (const rule of MERCHANT_BRAND_RULES) {
    if (rule.patterns.some((pattern) => base.includes(pattern))) {
      return rule.key;
    }
  }

  // Generic fallback
  return base || 'unknown';
}
