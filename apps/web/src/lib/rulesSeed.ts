export type SeedDraft = {
  name?: string;
  when: { merchant?: string; description?: string; [k: string]: any };
  then?: { category?: string; [k: string]: any };
  month?: string;
};

export type TxnLike = {
  id?: string | number;
  merchant?: string;
  description?: string;
  category_guess?: string;
};

/** Seed a RuleTester draft from a transaction and open the tester if available. */
export function seedRuleFromTxn(txn: TxnLike, opts?: { month?: string }) {
  const draft: SeedDraft = {
    name: txn.merchant ? `If merchant contains "${txn.merchant}"` : "New rule",
    when: {
      ...(txn.merchant ? { merchant: txn.merchant } : {}),
      ...(txn.description ? { description: txn.description } : {}),
    },
    then: { ...(txn.category_guess ? { category: txn.category_guess } : {}) },
    ...(opts?.month ? { month: opts.month } : {}),
  };

  // Queue for late-mounted panel
  (window as any).__pendingRuleSeed = draft;
  // Best-effort open
  (window as any).__openRuleTester?.(draft);
  // Dispatch event for listeners
  window.dispatchEvent(new CustomEvent('ruleTester:seed', { detail: draft }));
  return draft;
}
