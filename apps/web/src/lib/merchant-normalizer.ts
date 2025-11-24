// apps/web/src/lib/merchant-normalizer.ts

export type MerchantKind =
  | "p2p"
  | "subscription"
  | "retail"
  | "atm"
  | "cash"
  | "other";

export type MerchantCategoryHint =
  | "transfers"
  | "subscriptions"
  | "groceries"
  | "fuel"
  | "dining"
  | "atm"
  | "cash"
  | "other"
  | "unknown";

export interface MerchantBrandRule {
  /** Stable id for debugging / tests */
  id: string;
  /** Pattern to match raw statement description or merchant field */
  pattern: RegExp;
  /** Normalized, user-facing merchant label */
  normalized: string;
  kind?: MerchantKind;
  categoryHint?: MerchantCategoryHint;
}

export interface NormalizedMerchant {
  /** Human readable label (e.g. "Zelle transfer") */
  display: string;
  /** Optional semantic kind (p2p, subscription, etc.) */
  kind?: MerchantKind;
  /** Optional category hint (e.g. "transfers") */
  categoryHint?: MerchantCategoryHint;
}

/**
 * Brand-specific rules that override generic cleanup.
 * Keep this small and high-signal – we only add brands we care about.
 */
export const MERCHANT_BRAND_RULES: MerchantBrandRule[] = [
  {
    id: "zelle_now_withdrawal",
    pattern: /\b(now\s+withdrawal|zelle(?:\s+(payment|transfer))?)\b/i,
    normalized: "Zelle transfer",
    kind: "p2p",
    categoryHint: "transfers",
  },
  {
    id: "venmo",
    pattern: /\bvenmo\b/i,
    normalized: "Venmo",
    kind: "p2p",
    categoryHint: "transfers",
  },
  {
    id: "cash_app",
    // Square Cash descriptors often start with "SQ *" or "SQC*"
    pattern: /\b(sq\s*\*|sqc\*|cash\s*app)\b/i,
    normalized: "Cash App",
    kind: "p2p",
    categoryHint: "transfers",
  },
  {
    id: "paypal_p2p",
    // Treat generic PayPal as P2P except when obviously a merchant name follows.
    pattern:
      /\bpaypal\b(?!.*\b(netflix|spotify|amazon|adobe|microsoft|apple)\b)/i,
    normalized: "PayPal",
    kind: "p2p",
    categoryHint: "transfers",
  },
  // Additional brand rules
  {
    id: "apple_cash",
    pattern: /\bapple\s*cash\b/i,
    normalized: "Apple Cash",
    kind: "p2p",
    categoryHint: "transfers",
  },
  {
    id: "playstation",
    pattern: /\b(playstatio|playstation)\b/i,
    normalized: "PlayStation",
    kind: "subscription",
    categoryHint: "subscriptions",
  },
  {
    id: "netflix",
    pattern: /\bnetflix\b/i,
    normalized: "Netflix",
    kind: "subscription",
    categoryHint: "subscriptions",
  },
  {
    id: "spotify",
    pattern: /\bspotify\b/i,
    normalized: "Spotify",
    kind: "subscription",
    categoryHint: "subscriptions",
  },
  {
    id: "starbucks",
    pattern: /\bstarbucks\b/i,
    normalized: "Starbucks",
    kind: "retail",
    categoryHint: "dining",
  },
  {
    id: "uber",
    pattern: /\buber(?!\s*eats)\b/i,
    normalized: "Uber",
    kind: "retail",
    categoryHint: "other",
  },
  {
    id: "lyft",
    pattern: /\blyft\b/i,
    normalized: "Lyft",
    kind: "retail",
    categoryHint: "other",
  },
  {
    id: "harris_teeter",
    pattern: /\bharris\s*teeter\b/i,
    normalized: "Harris Teeter",
    kind: "retail",
    categoryHint: "groceries",
  },
];

/**
 * Generic cleanup: strip noise, collapse spaces, remove long numeric tails.
 */
function basicNormalize(raw: string): string {
  if (!raw) return "Unknown";

  let s = raw.trim();

  // Normalize separators a bit
  s = s.replace(/[*_]+/g, " ");
  s = s.replace(/\s{2,}/g, " ");

  // Drop long trailing numeric blobs and phone-like tails
  s = s.replace(
    /\s+(x?\d{4,}|\d{3}-\d{3,}-\d{3,}|\d{10,}|[0-9]{4,}[A-Z0-9-]*)\s*$/i,
    ""
  ).trim();

  if (!s) return "Unknown";

  // Title-case-ish without being too fancy
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Normalize a raw merchant/description into:
 * - display name (for UI)
 * - optional kind (p2p, subscription, etc.)
 * - optional categoryHint (e.g. "transfers")
 */
export function normalizeMerchantForDisplayAndCategory(
  raw: string
): NormalizedMerchant {
  if (!raw) {
    return {
      display: "Unknown",
      categoryHint: "unknown",
    };
  }

  // 1) Brand-specific overrides
  const brandRule = MERCHANT_BRAND_RULES.find((rule) => rule.pattern.test(raw));
  if (brandRule) {
    return {
      display: brandRule.normalized,
      kind: brandRule.kind,
      categoryHint: brandRule.categoryHint ?? "other",
    };
  }

  // 2) Generic cleanup
  const display = basicNormalize(raw);

  return {
    display,
    categoryHint: "unknown",
  };
}

/**
 * Minimal shape we need from the backend for merchant charts.
 * (you already have something similar; adjust field names as needed)
 */
export interface MerchantChartRow {
  merchantRaw: string; // backend field merchant / label / description
  spend: number; // positive amount
  txns: number; // transaction count
  category?: string; // optional category slug from backend
}

/**
 * Output row for the Top Merchants chart after normalization + grouping.
 */
export interface MerchantChartRowGrouped {
  merchant: string; // what we show on hover / tooltip
  spend: number;
  txns: number;
  kind?: MerchantKind;
  categoryHint?: MerchantCategoryHint;
  category?: string; // optional category slug from backend
}

/**
 * Normalize merchants and group all Transfers/P2P into a single logical bar
 * "Transfers / P2P". Everyone else keeps their own bucket.
 */
export function normalizeAndGroupMerchantsForChart(
  rows: MerchantChartRow[],
  minSpend = 0.01
): MerchantChartRowGrouped[] {
  const buckets = new Map<string, MerchantChartRowGrouped>();

  for (const row of rows) {
    if (!row) continue;

    const amount = Number(row.spend ?? 0);
    if (!Number.isFinite(amount) || Math.abs(amount) < minSpend) continue;

    const norm = normalizeMerchantForDisplayAndCategory(row.merchantRaw);
    const isTransfers = norm.categoryHint === "transfers";

    const key = isTransfers ? "Transfers / P2P" : norm.display || "Unknown";

    const existing = buckets.get(key) ?? {
      merchant: key,
      spend: 0,
      txns: 0,
      kind: norm.kind,
      categoryHint: norm.categoryHint,
      category: row.category, // preserve category from backend
    };

    existing.spend += amount;
    existing.txns += row.txns ?? 0;

    // Prefer a concrete kind/categoryHint if we didn't have one yet
    if (!existing.kind && norm.kind) existing.kind = norm.kind;
    if (!existing.categoryHint && norm.categoryHint)
      existing.categoryHint = norm.categoryHint;
    // Preserve category from first row if not set
    if (!existing.category && row.category) existing.category = row.category;

    buckets.set(key, existing);
  }

  return Array.from(buckets.values()).sort((a, b) => b.spend - a.spend);
}
