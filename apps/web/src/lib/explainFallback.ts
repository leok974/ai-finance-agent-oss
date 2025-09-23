// Utility for building deterministic explanation fallback HTML
// Accepts transaction-like object and evidence subset from ExplainResponse
export interface TxnLike {
  merchant?: string;
  description?: string;
  amount?: number;
  category?: string;
}

export interface RuleMatch { id?: number; category?: string }
export interface EvidenceLike {
  rule_match?: RuleMatch | null;
  merchant_norm?: string | null;
}

export function buildDeterministicExplain(txn: TxnLike | undefined, evidence: EvidenceLike | undefined, rationale: string | undefined) {
  const rule = evidence?.rule_match;
  const parts: string[] = [];
  if (rule?.category) parts.push(`<strong>Matched rule:</strong> ${rule.category}`);
  if (evidence?.merchant_norm) parts.push(`<strong>Merchant:</strong> ${evidence.merchant_norm}`);
  if (txn?.description) parts.push(`<strong>Description:</strong> ${txn.description}`);
  if (typeof txn?.amount === 'number') {
    const abs = Math.abs(txn.amount).toFixed(2);
    parts.push(`<strong>Amount:</strong> $${abs} ${txn.amount < 0 ? '(expense)' : '(income)'}`);
  }
  if (txn?.category) parts.push(`<strong>Chosen category:</strong> ${txn.category}`);
  const tooShort = !rationale || rationale.trim().length < 24 || /^ok\b/i.test(rationale.trim());
  if (!tooShort) return null;
  return `
    <p>This classification used deterministic signals (no model response was needed).</p>
    <h3>Evidence</h3>
    <ul>${parts.map(p => `<li>${p}</li>`).join('')}</ul>
    <p class="mt-3 text-xs opacity-70">Tip: Save a rule for this merchant to auto-apply next time.</p>
  `;
}
