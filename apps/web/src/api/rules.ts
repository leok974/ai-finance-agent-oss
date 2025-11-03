import { fetchJSON } from '@/lib/http';

export type RuleCreateResult = { ok: boolean; id?: string | number; message?: string };

// We first try the new agent tools endpoint (preferred). Fallbacks try legacy save.
export async function createCategorizeRule(params: { merchant: string; category: string }): Promise<RuleCreateResult> {
  const { merchant, category } = params;
  // Shapes to attempt (stop at first success)
  const attempts: Array<() => Promise<RuleCreateResult>> = [
    async () => {
      const data = await fetchJSON('agent/tools/rules/save', {
        method: 'POST',
        body: JSON.stringify({ rules: [{ kind: 'categorize', merchant, category }] }),
      });
      return normalizeCreateResp(data, 'created');
    },
    async () => {
      const data = await fetchJSON('agent/tools/rules/save', {
        method: 'POST',
        body: JSON.stringify({ rules: [{ action: 'set_category', field: 'merchant', op: 'equals', pattern: merchant, category }] }),
      });
      return normalizeCreateResp(data, 'created');
    },
    // Legacy path (kept for compatibility). This intentionally uses /api/ because legacy backend may only expose it there.
    async () => {
      const resp = await fetch('/api/rules/save', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rules: [{ action: 'set_category', field: 'merchant', op: 'equals', pattern: merchant, category }] }),
      });
      if (!resp.ok) throw new Error(`legacy save failed ${resp.status}`);
      const data = await resp.json().catch(() => ({}));
      return normalizeCreateResp(data, 'created');
    },
  ];

  for (const attempt of attempts) {
    try {
      const r = await attempt();
      if (r.ok) return r;
    } catch (e) {
      // Continue to next attempt
    }
  }
  return { ok: false, message: 'no endpoint accepted the payload' };
}

function normalizeCreateResp(data: unknown, defaultMsg: string): RuleCreateResult {
  if (!data || typeof data !== 'object') return { ok: true, message: defaultMsg };
  const o = data as Record<string, unknown>;
  const idsVal = o.ids;
  const idCandidate = ((): string | number | undefined => {
    if (typeof o.id === 'string' || typeof o.id === 'number') return o.id;
    const maybeRuleId = (o as Record<string, unknown>).rule_id;
    if (typeof maybeRuleId === 'string' || typeof maybeRuleId === 'number') return maybeRuleId;
    if (Array.isArray(idsVal)) {
      const first = idsVal[0];
      if (typeof first === 'string' || typeof first === 'number') return first;
    }
    return undefined;
  })();
  if (o.ok === false) return { ok: false, message: (o.message as string) || 'error' };
  return { ok: true, id: idCandidate, message: (o.message as string) || defaultMsg };
}
