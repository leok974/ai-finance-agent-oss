import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { getRules, deleteRule, type Rule, type RuleInput, type RuleListItem, fetchRuleSuggestConfig, type RuleSuggestConfig } from '@/api';
import { addRule } from '@/state/rules';
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers';
import { t } from '@/lib/i18n';
import { ToastAction } from '@/components/ui/toast';
import { scrollToId } from '@/lib/scroll';
import { setRuleDraft } from '@/state/rulesDraft';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoDot } from './InfoDot';
import Card from './Card';
import { setBudget, deleteBudget } from '@/lib/api';
import { Button } from '@/components/ui/button';

type Props = { month?: string; refreshKey?: number };

function RulesPanelImpl({ month, refreshKey }: Props) {
  const ok = emitToastSuccess; const err = emitToastError;
  // Removed useToast in favor of unified emit helpers
  const [rules, setRules] = useState<RuleListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;
  const [cfg, setCfg] = useState<RuleSuggestConfig | null>(null);
  const [form, setForm] = useState<RuleInput>({
    name: '',
    enabled: true,
    when: { description_like: '' },
    then: { category: '' },
  });
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');

  // Derived values for UX and validation
  const { like, category, derivedName, canCreate } = useMemo(() => {
    const _like = String((form as any)?.when?.description_like || '').trim();
    const _category = String((form as any)?.then?.category || '').trim();
    const _derivedName = (form?.name || '').trim() || `${_like || 'Any'} → ${_category || 'Uncategorized'}`;
    return { like: _like, category: _category, derivedName: _derivedName, canCreate: _like.length > 0 && _category.length > 0 };
  }, [form]);

  const abortRef = useRef<AbortController | null>(null);
  const lastReqRef = useRef(0);
  const COALESCE_MS = 400;
  const load = useCallback(async () => {
    const now = Date.now();
    if (now - lastReqRef.current < COALESCE_MS) return; // coalesce bursts
    lastReqRef.current = now;
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch (_err) { /* intentionally empty: swallow to render empty-state */ }
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const res = await getRules({ q: q || undefined, limit, offset: page * limit, signal: ac.signal } as any);
      setRules(Array.isArray((res as any).items) ? (res as any).items : []);
      setTotal(Number((res as any).total || 0));
    } catch (e: any) {
      if (ac.signal.aborted) return; // ignore aborted
  err(t('ui.toast.rules_list_load_failed'), { description: 'Load failed' });
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setLoading(false);
    }
  }, [q, page, err]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchRuleSuggestConfig().then(setCfg).catch(() => {}); }, []);
  useEffect(() => {
    if (typeof refreshKey !== 'undefined') load();
  }, [refreshKey, load]);

  // Listen for external refresh events (e.g., RuleTesterPanel simple save)
  useEffect(() => {
    const onRefresh = () => queueMicrotask(() => load());
    window.addEventListener('rules:refresh', onRefresh);
    return () => window.removeEventListener('rules:refresh', onRefresh);
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const like = String((form as any)?.when?.description_like || '').trim();
      const category = (form?.then?.category || '').trim() || 'Uncategorized';
      const name = (form?.name || '').trim() || `${like || 'Any'} → ${category}`;
      const res = await addRule({ name, enabled: true, when: { description_like: like }, then: { category } } as any);
      // Seed Rule Tester with what you just created
      setRuleDraft({
        name: (res as any)?.display_name || name,
        when: { description_like: like },
        then: { category },
      });
      setForm({ name: '', enabled: true, when: { description_like: '' }, then: { category: '' } });
      load();
      // Use raw toast so we can attach actions
  emitToastSuccess(t('ui.toast.rule_created_title'), { description: t('ui.toast.rule_created_description', { name: (res as any)?.display_name || name }) });
    } catch (e: any) {
      const message = e?.message || 'Failed to create rule';
  err(message, { description: 'Create failed' });
    } finally {
      setCreating(false);
    }
  }

  // Removed Enable/Disable toggle per request.

  async function remove(rule: Rule) {
    const keep = confirm(`Delete rule “${rule.name}”?`);
    if (!keep) return;
    const prev = rules;
    setRules(rules?.filter(r => r.id !== rule.id) ?? null);
    try {
      await deleteRule(rule.id);
    } catch (e) {
      setRules(prev ?? null);
    }
  }

  function getBadgeFor(rule: Rule) {
    try {
      const cache = JSON.parse(localStorage.getItem('ruleTestCache') || '{}');
      const idMap = JSON.parse(localStorage.getItem('ruleIdNameMap') || '{}');
      const key = rule.name || idMap[rule.id] || JSON.stringify(rule.when || {});
      return cache[key] as { matched_count: number; tested_at: string } | undefined;
    } catch {
      return undefined;
    }
  }

  function parseAmountFromDescription(desc?: string | null) {
    if (!desc) return undefined;
    const m = /\$([\d.,]+)/.exec(desc);
    return m ? Number(m[1].replace(/,/g, '')) : undefined;
  }
  async function saveBudgetInline(category: string) {
    const amt = Number(editAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
  err(t('ui.toast.budget_inline_invalid_amount'));
      return;
    }
    try {
      const r = await setBudget(category, amt);
  ok(t('ui.toast.budget_inline_saved_title', { category, amount: `$${r.budget.amount.toFixed(2)}` }));
      setEditingId(null);
      await load();
    } catch (e: any) {
  err(e?.message ?? t('ui.toast.budget_inline_save_failed'));
    }
  }

  async function removeBudget(category: string) {
    try {
      const r = await deleteBudget(category);
      const { category: cat, amount } = r.deleted;
      ok(`Deleted budget for ${cat}`);
      // Provide a simple immediate undo without custom toast action for now
      try {
        await setBudget(cat, amount);
        ok(`Restored ${cat} = $${amount.toFixed(2)}`);
        await load();
      } catch (e: any) {
        err(e?.message ?? t('ui.toast.budget_inline_restore_failed'));
      }
      setEditingId(null);
      await load();
    } catch (e: any) {
  err(e?.message ?? t('ui.toast.budget_inline_delete_failed'));
    }
  }

  return (
    <section className="panel p-4 md:p-5">
    <div>
      {/* Header grid prevents overlap and keeps a tidy top-right Actions area */}
      <header className="grid grid-cols-[1fr_auto] gap-3 pb-3 mb-3 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-lg font-semibold shrink-0">Rules</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block cursor-help">ⓘ</span>
            </TooltipTrigger>
            <TooltipContent>
              Saved rules are patterns that auto-categorize your transactions.
              Each rule has a matcher (like “description contains Starbucks”) and a resulting category.
            </TooltipContent>
          </Tooltip>
          <input
            className="field-input w-[220px] sm:w-[280px] lg:w-[320px]"
            placeholder="Search rules…"
            value={q}
            onChange={(e) => { setPage(0); setQ(e.target.value); }}
          />
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Button
              onClick={load}
              variant="pill-outline"
              size="sm"
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button
              type="submit"
              form="rules-create-form"
              variant="pill-primary"
              size="sm"
              className={!canCreate ? 'opacity-60 cursor-not-allowed' : ''}
              disabled={creating || !canCreate}
              title="Create rule with the fields below"
            >
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </div>
          {cfg && (
            <div className="text-xs opacity-70">
              based on last {cfg.window_days ?? '∞'} days of feedback
            </div>
          )}
          <div className="flex items-center gap-2 text-xs whitespace-nowrap">
            <Button variant="pill-outline" size="sm" disabled={page===0} onClick={() => setPage(p=>Math.max(0,p-1))}>Prev</Button>
            <span className="opacity-70">{page*limit+1}–{Math.min((page+1)*limit, total)} of {total}</span>
            <Button variant="pill-outline" size="sm" disabled={(page+1)*limit>=total} onClick={() => setPage(p=>p+1)}>Next</Button>
          </div>
        </div>
  </header>

      {/* Give the form an id so the header button can submit it */}
      <form id="rules-create-form" onSubmit={onCreate} className="form-grid grid-cols-1 md:grid-cols-12">
        <div className="field col-span-3">
          <div className="field-label">
            <span className="label-nowrap" title="Rule name">Rule name</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block cursor-help flex-none">ⓘ</span>
              </TooltipTrigger>
              <TooltipContent>Short, descriptive label for this rule.</TooltipContent>
            </Tooltip>
          </div>
          <input
            className="field-input"
            placeholder="e.g., Coffee shops"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            title="Short, descriptive name for the rule"
          />
        </div>
        <div className="field col-span-5">
          <div className="field-label">
            <span title="Match — description contains">Match contains</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block cursor-help flex-none">ⓘ</span>
              </TooltipTrigger>
              <TooltipContent>Substring match (case-insensitive) against the transaction description.</TooltipContent>
            </Tooltip>
          </div>
          <input
            className="field-input"
            placeholder='e.g., "STARBUCKS" (case-insensitive)'
            value={(form.when as any).description_like ?? ''}
            onChange={(e) => setForm(f => ({ ...f, when: { ...(f.when || {}), description_like: e.target.value } }))}
            title='Substring match against description (SQL ILIKE "%text%")'
          />
        </div>
        <div className="field col-span-3">
          <div className="field-label">
            <span title="Then — set category">Set category</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block cursor-help flex-none">ⓘ</span>
              </TooltipTrigger>
              <TooltipContent>Category assigned to all matching transactions.</TooltipContent>
            </Tooltip>
          </div>
          <input
            className="field-input"
            placeholder="e.g., Coffee"
            value={form.then?.category ?? ''}
            onChange={(e) => setForm(f => ({ ...f, then: { ...(f.then || {}), category: e.target.value } }))}
            title="The category assigned to all matches"
          />
        </div>
  {/* Mobile actions handled in header now */}
      </form>

      {!rules?.length && (
        <p className="text-sm opacity-80">No rules yet. Create your first rule above.</p>
      )}

      {!!rules?.length && (
  <div className="space-y-3">
          {rules.map(rule => {
            const isBudget = ((rule as any).kind === 'budget' || String(rule.id).startsWith('budget:'));
            const category = (rule as any).category as string | undefined;
            const amountFromDesc = typeof (rule as any).amount === 'number' ? (rule as any).amount : parseAmountFromDescription((rule as any).description);
            const thresholds: any = (rule as any)?.when?.thresholds;
            const hasTh = thresholds && typeof thresholds === 'object' && Object.keys(thresholds).length > 0;
            const thBadge = hasTh ? `min ${thresholds.minConfidence ?? '-'}${thresholds.budgetPercent != null ? ", "+thresholds.budgetPercent+"%" : ''}${thresholds.limit != null ? ", ≤ "+thresholds.limit : ''}` : null;
            return (
              <div key={rule.id} className="panel-tight md:p-5 lg:p-6 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{rule.display_name}</span>
                    {isBudget && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">Budget</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${(rule.active ?? true) ? 'bg-emerald-600/10 text-emerald-600' : 'bg-zinc-600/10 text-zinc-500'}`}>
                      {(rule.active ?? true) ? 'Enabled' : 'Disabled'}
                    </span>
                    {thBadge && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800/60 border border-slate-700">Thresholds: {thBadge}</span>
                    )}
                  </div>
                  <div className="text-xs opacity-80 truncate">
                    {((rule as any).description) ? (
                      <span>{(rule as any).description}</span>
                    ) : (
                      rule.category ? <span>category: {rule.category}</span> : null
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isBudget && category ? (
                    editingId === rule.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0.01}
                          step="0.01"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          className="w-28 rounded-md border border-border bg-card px-2 py-1 text-sm"
                        />
                        <Button variant="pill-success" size="sm" onClick={() => saveBudgetInline(category)}>Save</Button>
                        <Button variant="pill-outline" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm opacity-80">Cap:&nbsp;{typeof amountFromDesc === 'number' ? `$${amountFromDesc.toFixed(2)}` : '—'}</span>
                        <Button
                          variant="pill-outline"
                          size="sm"
                          onClick={() => {
                            setEditingId(rule.id);
                            setEditAmount(typeof amountFromDesc === 'number' ? String(amountFromDesc.toFixed(2)) : '');
                          }}
                          title="Edit budget cap"
                        >
                          Edit
                        </Button>
                        <Button variant="pill-danger" size="sm" onClick={() => removeBudget(category)} title="Delete budget">
                          Clear
                        </Button>
                      </div>
                    )
                  ) : (
                    <Button variant="pill-danger" size="sm" onClick={() => remove({ id: rule.id, name: rule.display_name, enabled: rule.active ?? true, when: {}, then: { category: rule.category } })}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
  </div>
  </section>
  );
}

export default React.memo<Props>(RulesPanelImpl);
