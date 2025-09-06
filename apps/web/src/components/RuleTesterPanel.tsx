import React, { useState } from 'react';
import { testRule, saveTrainReclassify, type RuleInput } from '../lib/api';
import { useToast } from './Toast';
import { consumeRuleDraft, onOpenRuleTester } from '../state/rulesDraft';
import { getGlobalMonth, onGlobalMonthChange } from '../state/month';

export default function RuleTesterPanel({ onChanged }: { onChanged?: () => void }) {
  const { push } = useToast();
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
      push({ title: 'Rule test', message: `Matched ${r.matched_count} txn(s)` });
      // Cache last test result summary in localStorage for quick badges elsewhere
      try {
        const key = 'ruleTestCache';
        const cache = JSON.parse(localStorage.getItem(key) || '{}');
        const ruleKey = (form.name?.trim()) || JSON.stringify(form.when || {});
        cache[ruleKey] = { matched_count: r.matched_count, tested_at: new Date().toISOString() };
        localStorage.setItem(key, JSON.stringify(cache));
      } catch {}
    } catch (e: any) {
      push({ title: 'Rule test failed', message: e?.message ?? 'Rule test failed' });
    } finally {
      setTesting(false);
    }
  }

  async function onSaveTrainReclass() {
    setSaving(true);
    try {
  const { saved, trained, reclass } = await saveTrainReclassify(form, month || undefined);
      if (!reclass) {
        push({ title: 'Saved & retrained', message: 'Reclassify endpoint not found; run it from backend if needed.' });
        console.info('Try:\nInvoke-RestMethod -Method POST http://127.0.0.1:8000/txns/reclassify -Body "{}" -ContentType "application/json"');
      } else {
        push({ title: 'All done', message: 'Rule saved, model retrained, transactions reclassified.' });
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
      push({ title: 'Save failed', message: e?.message ?? 'Failed to save/train/reclassify' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 rounded-2xl shadow bg-card text-card-foreground" id="rule-tester-anchor">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Rule Tester</h2>
        <div className="text-xs opacity-70">Validate a rule → Save → Retrain → Reclassify</div>
      </div>

  <form onSubmit={onTest} className="grid md:grid-cols-6 gap-2 mb-4">
        <input
          className="col-span-1 px-3 py-2 rounded-xl border bg-background"
          placeholder="Rule name"
          value={form.name}
          onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
        />
        <input
          className="col-span-1 px-3 py-2 rounded-xl border bg-background"
          placeholder='Match: description contains…'
          value={(form.when as any).description_like ?? ''}
          onChange={(e) => setForm(f => ({ ...f, when: { ...(f.when || {}), description_like: e.target.value } }))}
        />
        <input
          className="col-span-1 px-3 py-2 rounded-xl border bg-background"
          placeholder="Then: set category…"
          value={form.then?.category ?? ''}
          onChange={(e) => setForm(f => ({ ...f, then: { ...(f.then || {}), category: e.target.value } }))}
        />
        <input
          className={`col-span-1 px-3 py-2 rounded-xl border bg-background ${useCurrentMonth ? 'opacity-60 cursor-not-allowed' : ''}`}
          placeholder="Month (YYYY-MM)"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          title={useCurrentMonth ? 'Following current month — uncheck to edit' : 'Type a month like 2025-08'}
          disabled={useCurrentMonth}
        />
        <label className="col-span-1 flex items-center gap-2 px-3 py-2 rounded-xl border bg-background text-sm select-none">
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
        <button
          type="submit"
          className="col-span-1 px-3 py-2 rounded-xl border font-medium hover:bg-accent"
          disabled={testing}
        >
          {testing ? 'Testing…' : 'Test rule'}
        </button>
      </form>

      {result && (
        <div className="rounded-xl border p-3 mb-3">
          <div className="text-sm font-medium mb-2">
            Matches: {result.matched_count}
          </div>
          {result.sample?.length ? (
            <div className="text-xs overflow-auto">
              <table className="w-full text-left border-separate border-spacing-y-1">
                <thead className="opacity-70">
                  <tr>
                    <th className="pr-2">Date</th>
                    <th className="pr-2">Merchant</th>
                    <th className="pr-2">Description</th>
                    <th className="pr-2">Amount</th>
                    <th className="pr-2">Current Category</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sample.slice(0, 10).map((t, i) => (
                    <tr key={i} className="bg-muted/40">
                      <td className="pr-2 py-1">{t.date}</td>
                      <td className="pr-2 py-1">{t.merchant ?? '—'}</td>
                      <td className="pr-2 py-1">{t.description ?? '—'}</td>
                      <td className="pr-2 py-1">{t.amount}</td>
                      <td className="pr-2 py-1">{t.category ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>

              </table>
            </div>
          ) : (
            <div className="text-xs opacity-70">No sample rows returned.</div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={onSaveTrainReclass}
          className="px-3 py-2 rounded-xl border font-medium hover:bg-accent"
          disabled={saving}
        >
          {saving ? 'Saving → Training → Reclassifying…' : 'Save → Retrain → Reclassify'}
        </button>
        <div className="text-xs opacity-70">
          Saves this rule, retrains the model, and reclassifies transactions.
        </div>
      </div>
    </div>
  );
}
