import { createRule, type RuleInput, type RuleCreateResponse } from "@/api";

// Thin wrapper to keep state-layer API consistent and typed
export async function addRule(rule: RuleInput): Promise<RuleCreateResponse> {
  const res = await createRule(rule);
  return res; // { id, display_name }
}
