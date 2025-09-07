import React, { useMemo, useState } from 'react';
import { testRule, saveTrainReclassify, type RuleInput } from '@/api';
import { useToast } from '@/hooks/use-toast';
import { consumeRuleDraft, onOpenRuleTester } from '@/state/rulesDraft';
import { getGlobalMonth, onGlobalMonthChange } from '@/state/month';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToastAction } from "@/components/ui/toast";
import { InfoDot } from './InfoDot';
import { scrollToId } from "@/lib/scroll";

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
  const [result, setResult] = useState<null | { matched_count?: number; count?: number; sample: any[] }>(null);
  const [force, setForce] = useState(false); // override existing categories when reclassifying

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
  cache[ruleKey] = { matched_count: (r as any).matched_count ?? (r as any).count ?? 0, tested_at: new Date().toISOString() };
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
      const like = String(form.when?.description_like || '').trim();
      const categoryVal = (form.then?.category || '').trim() || 'Uncategorized';
      const derivedName = (form.name || '').trim() || `${like || 'Any'} → ${categoryVal}`;
      const res = await saveTrainReclassify({
        rule: {
          name: derivedName,
          when: { description_like: like },
          then: { category: categoryVal },
        },
  month: useCurrentMonth ? getGlobalMonth() : month,
  force,
      } as any);

      // Infer how many transactions were reclassified (if API provides it)
      const reclass = (res as any)?.reclass;
      let reclassCount = 0;
      if (Array.isArray(reclass)) reclassCount = reclass.length;
      else if (reclass && typeof reclass === 'object') {
        reclassCount = Number(
          (reclass as any).updated ??
          (reclass as any).applied ??
          (reclass as any).reclassified ??
          (reclass as any).count ??
          (reclass as any).total
        ) || 0;
      } else {
        reclassCount = Number((res as any)?.reclassified ?? 0) || 0;
      }
      const category = categoryVal;
      const name = (res as any)?.display_name || derivedName;

      toast({
        title: 'Rule saved & model retrained',
        description:
          reclassCount > 0
            ? `Applied “${name}”. Reclassified ${reclassCount} transaction${reclassCount === 1 ? '' : 's'} to “${category}”${force ? ' (override on)' : ''}.`
            : `Applied “${name}”. Category set to “${category}”. No transactions needed reclassification${force ? ' (override on)' : ''}.`,
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

      // Cache id->name mapping using unified response
      try {
        const key = 'ruleIdNameMap';
        const map = JSON.parse(localStorage.getItem(key) || '{}');
        const rid = (res as any)?.rule_id;
        if (rid) {
          map[rid] = name;
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
    <section className="card p-3" id="rule-tester-anchor">
      {/* single-line toolbar that can horizontally scroll if crowded */}
      <header className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-2 border-b border-border/30">
        {/* Title + tooltip (kept compact) */}
        <div className="flex items-center gap-2 shrink-0">
          <h3 className="text-base font-semibold">Rule Tester</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block cursor-help">ⓘ</span>
            </TooltipTrigger>
            <TooltipContent>
              Validate → Save → Retrain → Reclassify. Matches on merchant/description (case-insensitive).
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Inputs (compact widths) */}
        <input
          className="input input-sm w-40"
          placeholder="e.g., Netflix → Subs"
          value={form?.name || ""}
          onChange={(e)=>setForm((f:any)=>({ ...f, name:e.target.value }))}
        />
        <input
          className="input input-sm w-56"
          placeholder='Match contains'
          value={String(((form as any)?.when)?.description_like || '')}
          onChange={(e)=>setForm((f:any)=>({ ...f, when:{ ...(f.when || {}), description_like:e.target.value }}))}
        />
        <input
          className="input input-sm w-44"
          placeholder="Set category"
          value={form?.then?.category || ""}
          onChange={(e)=>setForm((f:any)=>({ ...f, then:{ ...f.then, category:e.target.value }}))}
        />

        {/* Month + toggles */}
        <input
          type="month"
          value={month || ""}
          onChange={(e) => setMonth(e.target.value || '')}
          className="input input-sm w-[118px]"
        />
        <button
          type="button"
          className="btn btn-sm shrink-0"
          onClick={() => {
            const now = new Date();
            const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            setMonth(m);
          }}
        >
          Use current month
        </button>
        <label className="inline-flex items-center gap-2 px-2 py-1 rounded border border-border/40 hover:bg-muted cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-foreground"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
            aria-label="Override existing categories"
          />
          <span className="text-sm">Override existing</span>
        </label>
        {force && (
          <span
            className="hidden md:inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-800 border-amber-200 tracking-wide"
            title="Override is ON — reclassify can update already-categorized rows"
            aria-live="polite"
          >
            OVERRIDE
          </span>
        )}

        {/* Actions (right-aligned) */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button className="btn btn-sm" onClick={onTest} disabled={testing}>
            {testing ? "Testing…" : "Test"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setForm({ name: '', enabled: true, when: { description_like: '' }, then: { category: '' } } as any)}
          >
            Clear
          </button>
          <button className="btn btn-sm" onClick={onSaveTrainReclass} disabled={saving}>
            {saving ? "Saving…" : "Save → Retrain → Reclassify"}
          </button>
        </div>
      </header>
    </section>
  );
}
