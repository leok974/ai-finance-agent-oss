import React, { useEffect, useMemo, useState } from 'react';
import { getRules, deleteRule, type Rule, type RuleInput, type RuleListItem } from '@/api';
import { addRule } from '@/state/rules';
import { useOkErrToast } from '@/lib/toast-helpers';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { scrollToId } from '@/lib/scroll';
import { setRuleDraft } from '@/state/rulesDraft';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoDot } from './InfoDot';

type Props = { refreshKey?: number };

export default function RulesPanel({ refreshKey }: Props) {
  const { ok, err } = useOkErrToast();
  const { toast } = useToast();
  const [rules, setRules] = useState<RuleListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;
  const [form, setForm] = useState<RuleInput>({
    name: '',
    enabled: true,
    when: { description_like: '' },
    then: { category: '' },
  });

  // Derived values for UX and validation
  const { like, category, derivedName, canCreate } = useMemo(() => {
    const _like = String((form as any)?.when?.description_like || '').trim();
    const _category = String((form as any)?.then?.category || '').trim();
    const _derivedName = (form?.name || '').trim() || `${_like || 'Any'} → ${_category || 'Uncategorized'}`;
    return { like: _like, category: _category, derivedName: _derivedName, canCreate: _like.length > 0 && _category.length > 0 };
  }, [form]);

  async function load() {
    setLoading(true);
    try {
  const res = await getRules({ q: q || undefined, limit, offset: page * limit });
      setRules(Array.isArray(res.items) ? res.items : []);
      setTotal(Number(res.total || 0));
    } catch (e) {
      err('Could not load rules list', 'Load failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [q, page]);
  useEffect(() => {
    if (typeof refreshKey !== 'undefined') {
      load();
    }
  }, [refreshKey]);

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
      toast({
        title: 'Rule created',
        description: `“${(res as any)?.display_name || name}” saved successfully.`,
        duration: 4000,
        action: (
          <div className="flex gap-2">
            <ToastAction altText="View unknowns" onClick={() => scrollToId('unknowns-panel')}>
              View unknowns
            </ToastAction>
            <ToastAction altText="View charts" onClick={() => scrollToId('charts-panel')}>
              View charts
            </ToastAction>
          </div>
        ),
      });
    } catch (e: any) {
      const message = e?.message || 'Failed to create rule';
      err(message, 'Create failed');
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

  return (
    <div className="panel">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Rules</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block cursor-help">ⓘ</span>
            </TooltipTrigger>
            <TooltipContent>
              Saved rules are patterns that auto-categorize your transactions.
              Each rule has a matcher (like “description contains Starbucks”) and a resulting category.
            </TooltipContent>
          </Tooltip>
        </div>
        {/* Search + pager + actions (md+) */}
        <div className="hidden md:flex items-center gap-2">
          <input
            className="field-input w-56"
            placeholder="Search rules…"
            value={q}
            onChange={(e) => { setPage(0); setQ(e.target.value); }}
          />
          <div className="flex items-center gap-2 text-sm">
            <button className="btn btn-sm" disabled={page===0} onClick={() => setPage(p=>Math.max(0,p-1))}>Prev</button>
            <span>{page*limit+1}–{Math.min((page+1)*limit, total)} of {total}</span>
            <button className="btn btn-sm" disabled={(page+1)*limit>=total} onClick={() => setPage(p=>p+1)}>Next</button>
          </div>
          <button
            onClick={load}
            className="btn btn-sm hover:bg-accent"
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="submit"
            form="rules-create-form"
            className={`btn btn-sm hover:bg-accent ${!canCreate ? 'opacity-60 cursor-not-allowed' : ''}`}
            disabled={creating || !canCreate}
            title="Create rule with the fields below"
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>

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
          <div className="text-xs opacity-70 mt-1">
            Will save as: <span className="opacity-100">{derivedName}</span>
          </div>
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
        {/* Mobile-only search + create (header has md+ controls) */}
        <div className="col-span-1 flex items-end md:hidden gap-2">
          <input
            className="field-input"
            placeholder="Search rules…"
            value={q}
            onChange={(e) => { setPage(0); setQ(e.target.value); }}
            title="Search by name or category"
          />
          <button
            type="submit"
            className={`btn hover:bg-accent ${!canCreate ? 'opacity-60 cursor-not-allowed' : ''}`}
            disabled={creating || !canCreate}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>

      {!rules?.length && (
        <p className="text-sm opacity-80">No rules yet. Create your first rule above.</p>
      )}

      {!!rules?.length && (
        <div className="space-y-3">
          {rules.map(rule => (
            <div key={rule.id} className="p-3 rounded-xl border flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{rule.display_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${(rule.active ?? true) ? 'bg-emerald-600/10 text-emerald-600' : 'bg-zinc-600/10 text-zinc-500'}`}>
                    {(rule.active ?? true) ? 'Enabled' : 'Disabled'}
                  </span>
                  {(() => {
                    const badge = getBadgeFor({
                      id: rule.id,
                      name: rule.display_name,
                      enabled: rule.active ?? true,
                      when: {},
                      then: { category: rule.category },
                    } as Rule);
                    if (!badge) return null;
                    return (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-600/10 text-blue-600"
                        title={`Last tested ${new Date(badge.tested_at).toLocaleString()} — matched ${badge.matched_count}`}
                      >
                        last test: {badge.matched_count}
                      </span>
                    );
                  })()}
                </div>
                {rule.category && (
                  <div className="text-xs opacity-80 truncate">
                    category: {rule.category}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => remove({ id: rule.id, name: rule.display_name, enabled: rule.active ?? true, when: {}, then: { category: rule.category } })} className="text-xs px-2 py-1 rounded-lg border hover:bg-destructive/10 text-destructive">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
