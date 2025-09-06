import React, { useEffect, useState } from 'react';
import { getRules, createRule, updateRule, deleteRule, type Rule, type RuleInput } from '@/api';
import { useOkErrToast } from '@/lib/toast-helpers';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoDot } from './InfoDot';

type Props = { refreshKey?: number };

export default function RulesPanel({ refreshKey }: Props) {
  const { ok, err } = useOkErrToast();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<RuleInput>({
    name: '',
    enabled: true,
    when: { description_like: '' },
    then: { category: '' },
  });

  async function refresh() {
    setLoading(true);
    try {
      const data = await getRules();
      setRules(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (typeof refreshKey !== 'undefined') {
      refresh();
    }
  }, [refreshKey]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      if (!form.name?.trim()) throw new Error('Please name your rule.');
      if (!form.then?.category?.trim()) throw new Error('Please set a target category.');
      await createRule(form);
      setForm({ name: '', enabled: true, when: { description_like: '' }, then: { category: '' } });
      refresh();
  ok(`“${form.name || 'Untitled'}” saved successfully.`, 'Rule created');
    } catch (e: any) {
      const message = e?.message || 'Failed to create rule';
      err(message, 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function toggleEnabled(rule: Rule) {
    const optimistic = rules?.map(r => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)) ?? null;
    setRules(optimistic);
    try {
      await updateRule(rule.id, { enabled: !rule.enabled, name: rule.name, when: rule.when, then: rule.then });
    } catch (e) {
      refresh();
    }
  }

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
        {/* Right actions (md+): Refresh + Create (submits the form below) */}
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={refresh}
            className="btn btn-sm hover:bg-accent"
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="submit"
            form="rules-create-form"
            className="btn btn-sm hover:bg-accent"
            disabled={creating}
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
        {/* Mobile-only create (header has md+ create) */}
        <div className="col-span-1 flex items-end md:hidden">
          <button
            type="submit"
            className="btn hover:bg-accent w-full"
            disabled={creating}
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
                  <span className="font-medium truncate">{rule.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${rule.enabled ? 'bg-emerald-600/10 text-emerald-600' : 'bg-zinc-600/10 text-zinc-500'}`}>
                    {rule.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {(() => {
                    const badge = getBadgeFor(rule);
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
                <div className="text-xs opacity-80 truncate">
                  when: {JSON.stringify(rule.when)} → then: {JSON.stringify(rule.then)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toggleEnabled(rule)} className="text-xs px-2 py-1 rounded-lg border hover:bg-accent">
                  {rule.enabled ? 'Disable' : 'Enable'}
                </button>
                <button onClick={() => remove(rule)} className="text-xs px-2 py-1 rounded-lg border hover:bg-destructive/10 text-destructive">
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
