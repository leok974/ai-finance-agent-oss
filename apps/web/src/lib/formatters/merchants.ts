/**
 * Merchant name formatters for consistent display across UI contexts.
 *
 * - Charts: Use getMerchantAliasName() for clean, canonical labels
 * - Transaction lists: Use getMerchantRawName() for full statement descriptions
 * - Unknowns panel: Use getMerchantRawName() to show exact transaction text
 */

/**
 * Merchant data shape from backend charts API.
 * Prefer merchant_display > merchant_canonical > legacy fields.
 */
export interface MerchantSummary {
  merchant_canonical?: string | null;
  merchant_display?: string | null;
  /** Legacy field for backward compatibility */
  merchant_key?: string | null;
  /** Legacy field for backward compatibility */
  label?: string | null;
  /** Legacy field for backward compatibility */
  name?: string | null;
  /** Raw transaction example */
  sample_description?: string | null;
}

/**
 * Transaction-level data shape.
 * Used for transaction lists and unknowns panel.
 */
export interface TransactionRow {
  description?: string | null;
  merchant?: string | null;
}

/**
 * Get canonical alias name for charts and labels.
 *
 * Priority:
 * 1. merchant_display (user-friendly title case)
 * 2. merchant_canonical (normalized lowercase key)
 * 3. Legacy fields (merchant_key, label, name)
 * 4. "Unknown" fallback
 *
 * Use this for:
 * - Chart labels (bar/pie/line charts)
 * - Chart tooltips
 * - Merchant summary cards
 * - Anywhere you want clean, canonical names
 *
 * @param merchant - Merchant data from backend
 * @returns Clean, user-facing merchant name
 *
 * @example
 * getMerchantAliasName({ merchant_display: "CVS Pharmacy" }) // "CVS Pharmacy"
 * getMerchantAliasName({ merchant_canonical: "cvs pharmacy" }) // "cvs pharmacy"
 * getMerchantAliasName({ label: "Harris Teeter" }) // "Harris Teeter"
 * getMerchantAliasName({}) // "Unknown"
 */
export function getMerchantAliasName(merchant: MerchantSummary): string {
  return (
    merchant.merchant_display ||
    merchant.merchant_canonical ||
    merchant.label ||
    merchant.merchant_key ||
    merchant.name ||
    "Unknown"
  );
}

/**
 * Get raw transaction description for transaction lists.
 *
 * Priority:
 * 1. description (full bank statement text)
 * 2. merchant (fallback merchant field)
 * 3. "Unknown transaction" fallback
 *
 * Use this for:
 * - Transaction list rows
 * - Unknowns panel (to show full statement text)
 * - Anywhere you want to show the original bank description
 *
 * DO NOT use this for charts - it creates visual clutter.
 *
 * @param txn - Transaction row with description/merchant
 * @returns Raw bank statement description
 *
 * @example
 * getMerchantRawName({ description: "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON" })
 * // "CVS/PHARMACY #02006 2006-2525 CENTREVILLEHERNDON"
 *
 * getMerchantRawName({ merchant: "CVS PHARMACY" })
 * // "CVS PHARMACY"
 *
 * getMerchantRawName({})
 * // "Unknown transaction"
 */
export function getMerchantRawName(txn: TransactionRow): string {
  return txn.description || txn.merchant || "Unknown transaction";
}

/**
 * Helper to check if a merchant name looks like raw statement text.
 * Returns true if the name contains common raw transaction markers:
 * - Store numbers (#1234, STORE 5678)
 * - Long numeric sequences (addresses, phone numbers)
 * - Multiple slashes or special chars
 *
 * Use this to warn/validate that charts aren't using raw descriptions.
 *
 * @param name - Merchant name to check
 * @returns True if name appears to be raw transaction text
 *
 * @example
 * looksLikeRawDescription("CVS/PHARMACY #02006 2006-2525") // true
 * looksLikeRawDescription("CVS Pharmacy") // false
 * looksLikeRawDescription("HARRIS TEETER #0085 12960 HIGHLAND") // true
 */
export function looksLikeRawDescription(name: string): boolean {
  if (!name) return false;

  // Check for store numbers: #1234, STORE 5678, etc.
  if (/#\d{4,}/i.test(name)) return true;
  if (/\bstore\s+\d{3,}/i.test(name)) return true;

  // Check for long numeric sequences (addresses, phone numbers)
  if (/\d{4,}-\d{4,}/i.test(name)) return true;
  if (/\d{5,}/i.test(name)) return true;

  // Check for multiple slashes (e.g., "CVS/PHARMACY/LOCATION")
  const slashCount = (name.match(/\//g) || []).length;
  if (slashCount >= 2) return true;

  return false;
}
