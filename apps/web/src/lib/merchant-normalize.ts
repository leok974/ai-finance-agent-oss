/**
 * Merchant normalization utilities for displaying clean brand names.
 * Matches backend brand rules from apps/backend/app/services/charts_data.py
 */

type MerchantBrandRule = {
  key: string;
  label: string;
  patterns: string[];
};

/**
 * Brand rules matching backend MERCHANT_BRAND_RULES configuration.
 * Add new rules here as you discover noisy merchant patterns.
 */
const MERCHANT_BRAND_RULES: MerchantBrandRule[] = [
  {
    key: 'playstation',
    label: 'PlayStation',
    patterns: ['playstatio', 'playstation'],
  },
  {
    key: 'harris_teeter',
    label: 'Harris Teeter',
    patterns: ['harris teeter'],
  },
  {
    key: 'now_withdrawal',
    label: 'NOW Withdrawal',
    patterns: ['now withdrawal'],
  },
  {
    key: 'amazon',
    label: 'Amazon',
    patterns: ['amazon'],
  },
  {
    key: 'starbucks',
    label: 'Starbucks',
    patterns: ['starbucks'],
  },
  {
    key: 'target',
    label: 'Target',
    patterns: ['target'],
  },
  {
    key: 'walmart',
    label: 'Walmart',
    patterns: ['walmart'],
  },
  {
    key: 'cvs',
    label: 'CVS Pharmacy',
    patterns: ['cvs'],
  },
  {
    key: 'walgreens',
    label: 'Walgreens',
    patterns: ['walgreens'],
  },
  {
    key: 'netflix',
    label: 'Netflix',
    patterns: ['netflix'],
  },
  {
    key: 'spotify',
    label: 'Spotify',
    patterns: ['spotify'],
  },
  {
    key: 'uber',
    label: 'Uber',
    patterns: ['uber'],
  },
  {
    key: 'lyft',
    label: 'Lyft',
    patterns: ['lyft'],
  },
  {
    key: 'doordash',
    label: 'DoorDash',
    patterns: ['doordash'],
  },
  {
    key: 'github',
    label: 'GitHub',
    patterns: ['github'],
  },
  {
    key: 'apple',
    label: 'Apple',
    patterns: ['apple.com', 'apple '],
  },
  {
    key: 'google',
    label: 'Google',
    patterns: ['google'],
  },
  {
    key: 'microsoft',
    label: 'Microsoft',
    patterns: ['microsoft'],
  },
  {
    key: 'adobe',
    label: 'Adobe',
    patterns: ['adobe'],
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    patterns: ['linkedin'],
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
 * Returns a clean, branded display name (e.g., "PlayStation" instead of "PLAYSTATIO PLAYSTATION.COM").
 *
 * @param raw - Raw merchant string from bank statement
 * @returns Clean display name
 */
export function normalizeMerchantForDisplay(raw: string): string {
  const base = normalizeMerchantBase(raw);

  // Try brand rules first
  for (const rule of MERCHANT_BRAND_RULES) {
    if (rule.patterns.some((pattern) => base.includes(pattern))) {
      return rule.label;
    }
  }

  // Generic fallback for unknown merchants
  const label = base.charAt(0).toUpperCase() + base.slice(1);
  return label.length > 32 ? label.slice(0, 29) + '...' : label;
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
