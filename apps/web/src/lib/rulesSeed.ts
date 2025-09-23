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

  window.dispatchEvent(new CustomEvent("ruleTester:seed", { detail: draft }));

  const open = (window as any).__openRuleTester as ((d: SeedDraft) => void) | undefined;
  if (typeof open === "function") open(draft);
  return draft;
}
