import React, { useMemo, useState, useEffect } from 'react';
import * as ReactDOM from 'react-dom';
import { usePersistentFlag } from '@/lib/usePersistentFlag';
import type { SeedDraft } from '@/lib/rulesSeed';
import { testRule, saveTrainReclassify, saveRule, type RuleInput } from '@/api';
import { ThresholdsSchema } from '@/lib/schemas';
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers';
import { consumeRuleDraft, onOpenRuleTester } from '@/state/rulesDraft';
import { getGlobalMonth, onGlobalMonthChange } from '@/state/month';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToastAction } from "@/components/ui/toast";
import { InfoDot } from './InfoDot';
import { scrollToId } from "@/lib/scroll";

declare global {
  interface Window {
    __openRuleTester?: (d?: any) => void;
    __pendingRuleSeed?: any | null;
  }
}

export default function RuleTesterPanel({ onChanged }: { onChanged?: () => void }) {
  // Legacy useToast removed in favor of unified emit helpers
  const [form, setForm] = useState<RuleInput>({
    name: '',
    enabled: true,
    when: { description_like: '' },
    then: { category: '' },
  });
  const [open, setOpen] = useState<boolean>(false);
  const [month, setMonth] = useState<string>(getGlobalMonth() || ''); // "YYYY-MM"
  const [useCurrentMonth, setUseCurrentMonth] = useState<boolean>(true);
  const [seededMonth, setSeededMonth] = useState<string | undefined>(undefined);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retrainMode, setRetrainMode] = usePersistentFlag('retrainMode', false);
  const [result, setResult] = useState<null | { matched_count?: number; count?: number; sample: any[] }>(null);

  // Derived values for UX and payloads
  const { like, category, derivedName, canTest, canSave } = useMemo(() => {
    const _like = String(form.when?.description_like || '').trim();
    const _category = String(form.then?.category || '').trim();
    const _derivedName = (form.name || '').trim() || `${_like || 'Any'} → ${_category || 'Uncategorized'}`;
    return {
      like: _like,
      category: _category,
      derivedName: _derivedName,
      canTest: _like.length > 0,
      canSave: _like.length > 0 && _category.length > 0,
    };
  }, [form]);

  // Smooth scroll helper for CTA buttons (charts / unknowns)
  useEffect(() => {
    // Establish global open function
    window.__openRuleTester = (d?: SeedDraft) => {
      if (d) {
        setForm(f => ({
          name: d.name ?? f.name,
          enabled: true,
          when: { ...(f.when || {}), description_like: d.when?.merchant || d.when?.description || (d.when as any)?.description_like || '' },
          then: { ...(f.then || {}), category: d.then?.category || '' },
        }));
        if (d.month) setSeededMonth(d.month);
      }
      setOpen(true);
    };
    // Consume any queued seed that arrived pre-mount
    if (window.__pendingRuleSeed) {
      try { window.__openRuleTester?.(window.__pendingRuleSeed); } catch {}
      window.__pendingRuleSeed = null;
    }
    return () => { delete window.__openRuleTester; };
  }, []);

  useEffect(() => {
    // Draft system integration (existing logic preserved)
    const d = consumeRuleDraft();
    if (d) {
      setForm(f => ({
        name: d.name ?? f.name,
        enabled: d.enabled ?? f.enabled,
        when: { ...(f.when || {}), ...(d.when || {}) },
        then: { ...(f.then || {}), ...(d.then || {}) },
      }));
      if (!useCurrentMonth && (d as any).month) setMonth((d as any).month);
    }
    const offDraft = onOpenRuleTester(() => {
      const nd = consumeRuleDraft();
      if (!nd) return;
      setForm(f => ({
        name: nd.name ?? f.name,
        enabled: nd.enabled ?? f.enabled,
        when: { ...(f.when || {}), ...(nd.when || {}) },
        then: { ...(f.then || {}), ...(nd.then || {}) },
      }));
      if (!useCurrentMonth && (nd as any).month) setMonth((nd as any).month);
    });
    const offMonth = onGlobalMonthChange((m) => { if (useCurrentMonth) setMonth(m || ''); });
    const onSeed = (e: Event) => {
      const ce = e as CustomEvent<SeedDraft>;
      const sd = ce?.detail;
      if (!sd) return;
      window.__openRuleTester?.(sd);
    };
    window.addEventListener('ruleTester:seed', onSeed as EventListener);
    return () => { offDraft(); offMonth(); window.removeEventListener('ruleTester:seed', onSeed as EventListener); };
  }, [useCurrentMonth]);

  async function onTest(e: React.FormEvent) {
    e.preventDefault();
    setTesting(true);
    setResult(null);
    try {
      const descLike = String((form as any)?.when?.description_like || '').trim();
      const safeRule = {
        ...form,
        when: { ...(form.when || {} as any), description_like: descLike },
        then: { category: form.then?.category?.trim() || 'Uncategorized' },
      } as RuleInput;
      console.debug('TEST payload', {
        rule: {
          name: form.name,
          when: { description_like: descLike },
          then: { category: form.then?.category || '' },
        },
        month: (useCurrentMonth ? getGlobalMonth() : month) || undefined,
      });
      const r = await testRule({
        rule: safeRule,
        month: (useCurrentMonth ? getGlobalMonth() : month) || undefined,
      });
      setResult(r);
      // Infer match count for UX feedback
      let matchCount = 0;
      if (Array.isArray(r)) matchCount = r.length;
      else if (r && typeof r === 'object') {
        matchCount = Number((r as any).matched_count ?? (r as any).count ?? (r as any).matches ?? (r as any).total) || 0;
      }
      const category = form.then?.category || '—';
      emitToastSuccess('Rule tested', {
        description: matchCount > 0
          ? `Matched ${matchCount} transaction${matchCount === 1 ? '' : 's'}. Will set category: “${category}”.`
          : `No matches for the selected month. Category would be: “${category}”.`,
        action: {
          label: 'View charts',
          onClick: () => scrollToId('charts-panel')
        }
      });
      // Cache last test result summary in localStorage for quick badges elsewhere
      try {
        const key = 'ruleTestCache';
        const cache = JSON.parse(localStorage.getItem(key) || '{}');
  const ruleKey = (form.name?.trim()) || JSON.stringify(form.when || {});
  cache[ruleKey] = { matched_count: (r as any).matched_count ?? (r as any).count ?? 0, tested_at: new Date().toISOString() };
        localStorage.setItem(key, JSON.stringify(cache));
      } catch {}
    } catch (e: any) {
      emitToastError('Test failed', { description: e?.message ?? 'Could not validate the rule. Please check the inputs.' });
    } finally {
      setTesting(false);
    }
  }

  async function onUnifiedSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const like = String(form.when?.description_like || '').trim();
      const categoryVal = (form.then?.category || '').trim() || 'Uncategorized';
      const name = (form.name || '').trim() || `${like || 'Any'} → ${categoryVal}`;
      let thresholds: any = undefined;
      try { thresholds = ThresholdsSchema.parse((form as any)?.when?.thresholds || {}); } catch { thresholds = undefined; }
      if (retrainMode) {
        const res: any = await saveTrainReclassify({
          rule: { name, when: { description_like: like }, then: { category: categoryVal } },
          month: seededMonth ?? (useCurrentMonth ? getGlobalMonth() : month),
        } as any);
        let reclassCount = 0;
        const reclass = (res as any)?.reclass;
        if (Array.isArray(reclass)) reclassCount = reclass.length; else if (reclass && typeof reclass === 'object') {
          reclassCount = Number((reclass as any).updated ?? (reclass as any).applied ?? (reclass as any).reclassified ?? (reclass as any).count ?? (reclass as any).total) || 0;
        } else {
          reclassCount = Number((res as any)?.reclassified ?? 0) || 0;
        }
        emitToastSuccess('Rule saved + retrained', { description: reclassCount > 0 ? `Reclassified ${reclassCount} txn${reclassCount===1?'':'s'} to “${categoryVal}”.` : 'No existing transactions required changes.' });
      } else {
        const when: Record<string, any> = { description_like: like };
        if (thresholds && Object.keys(thresholds).length) when.thresholds = thresholds;
  const selectedMonth = (seededMonth ?? ((useCurrentMonth ? getGlobalMonth() : month) || undefined));
  const res: any = await saveRule({ rule: { name, when, then: { category: categoryVal } }, month: selectedMonth }, { idempotencyKey: crypto.randomUUID() });
        emitToastSuccess('Rule saved', { description: `Saved “${res?.display_name || name}”.` });
      }
      window.dispatchEvent(new CustomEvent('rules:refresh'));
      onChanged?.();
    } catch (e: any) {
  emitToastError('Save failed', { description: e?.message || 'Unable to save rule' });
    } finally {
      setSaving(false);
    }
  }

  function clearForm() {
    setForm({ name: '', enabled: true, when: { description_like: '' }, then: { category: '' } });
    setUseCurrentMonth(true);
    setMonth(getGlobalMonth() || '');
    setResult(null);
  }

  if (!open) return null;
  const panel = (
    <div className="fixed inset-0 z-[9999]" id="rule-tester-anchor">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-card border-l border-border shadow-2xl p-4 md:p-5 lg:p-6 overflow-auto">
      <div className="flex items-center justify-between mb-3">
        {/* left: title + tooltip (baseline aligned) */}
        <div className="flex items-baseline gap-2">
           <h2 className="text-lg font-semibold">Rule Tester</h2>
           <Tooltip>
             <TooltipTrigger asChild>
               <span className="inline-block cursor-help">ⓘ</span>
             </TooltipTrigger>
             <TooltipContent>
               Prototype a rule, test it for a month, then save/retrain/reclassify.
             </TooltipContent>
           </Tooltip>
         </div>
        {/* right: tight Month + toggle (one line on md+) */}
        <div className="hidden md:flex items-center gap-2">
          <input
            className={`h-8 px-3 rounded-xl border bg-background text-sm w-24 ${
              useCurrentMonth ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            placeholder="YYYY-MM"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            title={useCurrentMonth ? 'Following current month — uncheck to edit' : 'Type a month like 2025-08'}
            disabled={useCurrentMonth}
          />
          <label className="btn-toggle whitespace-nowrap">
             <input
               type="checkbox"
               checked={useCurrentMonth}
               onChange={(e) => {
                 const next = e.target.checked;
                 setUseCurrentMonth(next);
                 if (next) setMonth(getGlobalMonth() || '');
               }}
             />
             Use current month
           </label>
         </div>
       </div>

    {/* Row 1: name / match / category (match made wider).
          On mobile, month controls appear below as a separate row. */}
      <form onSubmit={onTest} className="form-grid grid-cols-1 md:grid-cols-12">
        <div className="field col-span-12 md:col-span-3">
          <div className="field-label">
            <span>Rule name</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block cursor-help">ⓘ</span>
              </TooltipTrigger>
              <TooltipContent>Optional label—helps you identify the rule later.</TooltipContent>
            </Tooltip>
          </div>
          <input
            className="field-input"
            placeholder="e.g., Netflix subs"
            value={form.name}
            onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
            title="A label for this rule (optional for testing)"
          />
        </div>
        <div className="field col-span-12 md:col-span-6">
          <div className="field-label">
            <span title="Match — description contains">Match contains</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block cursor-help">ⓘ</span>
              </TooltipTrigger>
              <TooltipContent>Substring match (case-insensitive) against the transaction description.</TooltipContent>
            </Tooltip>
          </div>
          <input
            className="field-input"
            placeholder='e.g., "NETFLIX" (case-insensitive)'
            value={(form.when as any).description_like ?? ''}
            onChange={(e) => setForm(f => ({ ...f, when: { ...(f.when || {}), description_like: e.target.value } }))}
            title='Substring match against description (SQL ILIKE "%text%")'
          />
        </div>
        <div className="field col-span-12 md:col-span-3">
          <div className="field-label">
            <span title="Then — set category">Set category</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block cursor-help">ⓘ</span>
              </TooltipTrigger>
              <TooltipContent>Category to assign to all matches.</TooltipContent>
            </Tooltip>
          </div>
          <input
            className="field-input"
            placeholder="e.g., Subscriptions"
            value={form.then?.category ?? ''}
            onChange={(e) => setForm(f => ({ ...f, then: { ...(f.then || {}), category: e.target.value } }))}
            title="What category to assign to matches"
          />
        </div>

        {/* Thresholds advanced inputs */}
        <div className="field col-span-12 md:col-span-3">
          <div className="field-label flex items-center gap-2">
            <span>Thresholds</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block cursor-help">ⓘ</span>
              </TooltipTrigger>
              <TooltipContent>Optional advanced match thresholds (leave blank to ignore).</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex gap-2">
            <input
              className="field-input"
              placeholder="minConfidence"
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={(form as any)?.when?.thresholds?.minConfidence ?? ''}
              onChange={e => setForm(f => ({ ...f, when: { ...(f.when||{}), thresholds: { ...(f as any).when?.thresholds, minConfidence: e.target.value ? Number(e.target.value) : undefined } } }))}
              title="Minimum confidence (0-1)"
            />
            <input
              className="field-input"
              placeholder="maxFalsePos"
              type="number"
              step="1"
              min={0}
              value={(form as any)?.when?.thresholds?.maxFalsePos ?? ''}
              onChange={e => setForm(f => ({ ...f, when: { ...(f.when||{}), thresholds: { ...(f as any).when?.thresholds, maxFalsePos: e.target.value ? Number(e.target.value) : undefined } } }))}
              title="Max false positives"
            />
          </div>
          <div className="text-[10px] opacity-60 mt-1">Leave blank to skip thresholds.</div>
        </div>

        {/* Row 2 (mobile-only): month + toggle (since top-right is hidden on mobile) */}
        <div className="col-span-12 grid grid-cols-12 gap-3 items-center md:hidden">
          <div className="field col-span-7 min-w-0">
            <div className="field-label"><span>Month</span></div>
            <input
              className={`field-input h-8 ${useCurrentMonth ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder="YYYY-MM"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              disabled={useCurrentMonth}
            />
          </div>
          <label className="btn-toggle col-span-5 justify-center">
            <input
              type="checkbox"
              checked={useCurrentMonth}
              onChange={(e) => {
                const next = e.target.checked;
                setUseCurrentMonth(next);
                if (next) setMonth(getGlobalMonth() || '');
              }}
            />
            Use current month
          </label>
        </div>

    {/* Row 3: Actions (all on one row on md+) */}
        <div className="col-span-12 flex items-center justify-end gap-3 flex-wrap md:flex-nowrap">
          <label className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-border cursor-pointer select-none bg-card">
            <input type="checkbox" className="scale-110" checked={retrainMode} onChange={e=>setRetrainMode(e.target.checked)} />
            <span className="whitespace-nowrap">Retrain + reclassify</span>
          </label>
          <button
            type="submit"
            className={`btn hover:bg-accent w-full sm:w-auto shrink-0 ${!canTest ? 'opacity-60 cursor-not-allowed' : ''}`}
            disabled={testing || !canTest}
          >
            {testing ? 'Testing…' : 'Test rule'}
          </button>
          <button
            type="button"
            onClick={clearForm}
            className="btn hover:bg-muted w-full sm:w-auto shrink-0"
            title="Clear all fields and reset to current month"
          >
            Clear
          </button>
          <button
            onClick={onUnifiedSave}
            type="button"
            className={`btn hover:bg-accent w-full sm:w-auto shrink-0 font-semibold ${!canSave ? 'opacity-60 cursor-not-allowed' : ''}`}
            disabled={saving || !canSave}
            title={retrainMode ? 'Save rule, retrain model, and reclassify transactions' : 'Save rule only'}
          >
            {saving ? (retrainMode ? 'Saving + Retraining…' : 'Saving…') : (retrainMode ? 'Save + Retrain' : 'Save')}
          </button>
        </div>
      </form>

      <div className="text-xs opacity-70 mt-1 space-y-0.5">
        <div><strong>Test rule</strong> to preview matches for the selected month.</div>
        <div><strong>Save</strong> stores the rule. Enable <em>Retrain + reclassify</em> to also retrain the model and reclassify existing transactions.</div>
      </div>
      </div>
    </div>
  );
  return ReactDOM.createPortal(panel, document.body);
}
