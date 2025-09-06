// Lightweight singleton to pass a draft rule between panels.
// Uses a CustomEvent so we don't pull in state libs.

export type RuleDraft = {
  name?: string;
  enabled?: boolean;
  when?: Record<string, unknown>;
  then?: { category?: string };
};

const DRAFT_EVENT = 'open-rule-tester';
let _draft: RuleDraft | null = null;

export function setRuleDraft(draft: RuleDraft) {
  _draft = draft;
  window.dispatchEvent(new CustomEvent(DRAFT_EVENT));
}

export function consumeRuleDraft(): RuleDraft | null {
  const d = _draft;
  _draft = null;
  return d;
}

export function onOpenRuleTester(cb: () => void) {
  function handler() { cb(); }
  window.addEventListener(DRAFT_EVENT, handler);
  return () => window.removeEventListener(DRAFT_EVENT, handler);
}
