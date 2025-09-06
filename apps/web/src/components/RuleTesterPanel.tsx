import React, { useState } from 'react';
import { testRule, saveTrainReclassify, type RuleInput } from '../lib/api';
import { useToast } from './Toast';

export default function RuleTesterPanel({ onChanged }: { onChanged?: () => void }) {
  const { push } = useToast();
  const [form, setForm] = useState<RuleInput>({
    name: '',
    enabled: true,
    when: { description_like: '' },
    then: { category: '' },
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<null | { matched_count: number; sample: any[] }>(null);

  async function onTest(e: React.FormEvent) {
    e.preventDefault();
    setTesting(true);
    setResult(null);
    try {
      if (!form.then?.category?.trim()) throw new Error('Please choose a category to set.');
      const r = await testRule(form);
      setResult(r);
      push({ title: 'Rule test', message: `Matched ${r.matched_count} txn(s)` });
    } catch (e: any) {
      push({ title: 'Rule test failed', message: e?.message ?? 'Rule test failed' });
    } finally {
      setTesting(false);
    }
  }

  async function onSaveTrainReclass() {
    setSaving(true);
    try {
      const { saved, trained, reclass } = await saveTrainReclassify(form);
      if (!reclass) {
        push({ title: 'Saved & retrained', message: 'Reclassify endpoint not found; run it from backend if needed.' });
        console.info('Try:\nInvoke-RestMethod -Method POST http://127.0.0.1:8000/txns/reclassify -Body "{}" -ContentType "application/json"');
      } else {
        push({ title: 'All done', message: 'Rule saved, model retrained, transactions reclassified.' });
      }
      onChanged?.();
    } catch (e: any) {
      push({ title: 'Save failed', message: e?.message ?? 'Failed to save/train/reclassify' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 rounded-2xl shadow bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Rule Tester</h2>
        <div className="text-xs opacity-70">Validate a rule → Save → Retrain → Reclassify</div>
      </div>

      <form onSubmit={onTest} className="grid md:grid-cols-4 gap-2 mb-4">
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
