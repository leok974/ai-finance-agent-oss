import React, { useState } from 'react';
import { testRule, saveTrainReclassify, type RuleInput } from '@/api';
import { useToast } from '@/hooks/use-toast';
import { consumeRuleDraft, onOpenRuleTester } from '@/state/rulesDraft';
import { getGlobalMonth, onGlobalMonthChange } from '@/state/month';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToastAction } from "@/components/ui/toast";
import { InfoDot } from './InfoDot';

export default function RuleTesterPanel({ onChanged }: { onChanged?: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<RuleInput>({
    name: '',
    enabled: true,
    when: { description_like: '' },
    then: { category: '' },
  });
  const [month, setMonth] = useState<string>(getGlobalMonth() || ''); // "YYYY-MM"
  const [useCurrentMonth, setUseCurrentMonth] = useState<boolean>(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<null | { matched_count: number; sample: any[] }>(null);

  // Smooth scroll helper for CTA buttons (charts / unknowns)
  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  React.useEffect(() => {
    // On mount or when toggle changes, consume any pending draft
    const d = consumeRuleDraft();
    if (d) {
      setForm(f => ({
        name: d.name ?? f.name,
        enabled: d.enabled ?? f.enabled,
        when: { ...(f.when || {}), ...(d.when || {}) },
        then: { ...(f.then || {}), ...(d.then || {}) },
      }));
      // If not following current month, honor draft's month
      if (!useCurrentMonth && (d as any).month) setMonth((d as any).month);
    }
    // Subscribe to future open events
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
    // Live sync with global month when toggle is ON
    const offMonth = onGlobalMonthChange((m) => {
      if (useCurrentMonth) setMonth(m || '');
    });
    return () => { offDraft(); offMonth(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCurrentMonth]);

  async function onTest(e: React.FormEvent) {
    e.preventDefault();
    setTesting(true);
    setResult(null);
    try {
      if (!form.then?.category?.trim()) throw new Error('Please choose a category to set.');
      const r = await testRule(form, month || undefined);
      setResult(r);
      // Infer match count for UX feedback
      let matchCount = 0;
      if (Array.isArray(r)) matchCount = r.length;
      else if (r && typeof r === 'object') {
        matchCount = Number((r as any).matched_count ?? (r as any).count ?? (r as any).matches ?? (r as any).total) || 0;
      }
      const category = form.then?.category || '—';
      toast({
        title: 'Rule tested',
        description:
          matchCount > 0
            ? `Matched ${matchCount} transaction${matchCount === 1 ? '' : 's'}. Will set category: “${category}”.`
            : `No matches for the selected month. Category would be: “${category}”.`,
        duration: 4000,
        action: (
          <div className="flex gap-2">
            <ToastAction altText="View charts" onClick={() => scrollToId('charts-panel')}>
              View charts
            </ToastAction>
            <ToastAction altText="View unknowns" onClick={() => scrollToId('unknowns-panel')}>
              View unknowns
            </ToastAction>
          </div>
        ),
      });
      // Cache last test result summary in localStorage for quick badges elsewhere
      try {
        const key = 'ruleTestCache';
        const cache = JSON.parse(localStorage.getItem(key) || '{}');
        const ruleKey = (form.name?.trim()) || JSON.stringify(form.when || {});
        cache[ruleKey] = { matched_count: r.matched_count, tested_at: new Date().toISOString() };
        localStorage.setItem(key, JSON.stringify(cache));
      } catch {}
    } catch (e: any) {
      toast({
        title: 'Test failed',
        description: e?.message ?? 'Could not validate the rule. Please check the inputs.',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setTesting(false);
    }
  }

  async function onSaveTrainReclass() {
    setSaving(true);
    try {
      // Smooth scroll helper for CTA buttons
      const scrollToId = (id: string) => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };

      const effectiveMonth = useCurrentMonth ? (getGlobalMonth() || '') : month;
      const { saved, trained, reclass } = await saveTrainReclassify(
        form,
        effectiveMonth || undefined
      );

      // Infer how many transactions were reclassified (if API provides it)
      let reclassCount = 0;
      if (Array.isArray(reclass)) reclassCount = reclass.length;
      else if (reclass && typeof reclass === 'object') {
        reclassCount =
          Number(
            (reclass as any).updated ??
              (reclass as any).applied ??
              (reclass as any).reclassified ??
              (reclass as any).count ??
              (reclass as any).total
          ) || 0;
      }
      const category = form.then?.category || '—';
      const name = form.name?.trim() || 'Untitled';

      if (!reclass) {
        toast({
          title: 'Rule saved & model retrained',
          description:
            `Applied “${name}”. Reclassify endpoint not available; category would be “${category}”.`,
          duration: 5000,
          action: (
            <div className="flex gap-2">
              <ToastAction altText="View charts" onClick={() => scrollToId('charts-panel')}>
                View charts
              </ToastAction>
              <ToastAction altText="View unknowns" onClick={() => scrollToId('unknowns-panel')}>
                View unknowns
              </ToastAction>
            </div>
          ),
        });
        console.info(
          'Try:\nInvoke-RestMethod -Method POST http://127.0.0.1:8000/txns/reclassify -Body "{}" -ContentType "application/json"'
        );
      } else {
        toast({
          title: 'Rule saved & model retrained',
          description:
            reclassCount > 0
              ? `Applied “${name}”. Reclassified ${reclassCount} transaction${reclassCount === 1 ? '' : 's'} to “${category}”.`
              : `Applied “${name}”. Category set to “${category}”. No transactions needed reclassification.`,
          duration: 5000,
          action: (
            <div className="flex gap-2">
              <ToastAction altText="View charts" onClick={() => scrollToId('charts-panel')}>
                View charts
              </ToastAction>
              <ToastAction altText="View unknowns" onClick={() => scrollToId('unknowns-panel')}>
                View unknowns
              </ToastAction>
            </div>
          ),
        });
      }

      // Cache id->name mapping if backend returned a saved rule id
      try {
        const key = 'ruleIdNameMap';
        const map = JSON.parse(localStorage.getItem(key) || '{}');
        if ((saved as any)?.id && form?.name) {
          map[(saved as any).id] = form.name;
          localStorage.setItem(key, JSON.stringify(map));
        }
      } catch {}
      onChanged?.();
    } catch (e: any) {
      toast({
        title: 'Save / retrain / reclassify failed',
        description: e?.message ?? 'Please check your rule inputs and try again.',
        variant: 'destructive',
      });
      console.error(e);
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

  return (
    <div className="panel" id="rule-tester-anchor">
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
          <button
            type="submit"
            className="btn hover:bg-accent w-full sm:w-auto shrink-0"
            disabled={testing}
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
            onClick={onSaveTrainReclass}
            type="button"
            className="btn hover:bg-accent w-full sm:w-auto shrink-0 font-semibold"
            disabled={saving}
          >
            {saving ? 'Saving → Training → Reclassifying…' : 'Save → Retrain → Reclassify'}
          </button>
        </div>
      </form>

      <div className="text-xs opacity-70 mt-1">
        Saves this rule, retrains the model, and reclassifies transactions.
      </div>
    </div>
  );
}
