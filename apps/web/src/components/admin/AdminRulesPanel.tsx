import { useEffect, useState } from 'react';
import { listCatRules, patchCatRule, deleteCatRule, testCatRule, CategoryRule } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers';
import { t } from '@/lib/i18n';

export default function AdminRulesPanel() {
  const [data, setData] = useState<CategoryRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [testPattern, setTestPattern] = useState('');
  const [samples, setSamples] = useState('SPOTIFY Premium 12.99\nUBER Trip 18.50\nCOMCAST INTERNET');
  const [testResult, setTestResult] = useState<{ matches: string[]; misses: string[]; error?: string } | null>(null);
  const [updating, setUpdating] = useState<Record<number, boolean>>({});

  const loadRules = async () => {
    try {
      setIsLoading(true);
      const rules = await listCatRules();
      setData(rules);
      setIsError(false);
    } catch (err) {
      setIsError(true);
      emitToastError(t('ui.toast.rules_load_failed_title'), { description: String(err) });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRules();
  }, []);

  const handleUpdate = async (id: number, body: Partial<CategoryRule>) => {
    setUpdating(prev => ({ ...prev, [id]: true }));
    try {
      await patchCatRule(id, body);
      await loadRules();
      emitToastSuccess(t('ui.toast.rule_updated_title'));
    } catch (err) {
      emitToastError(t('ui.toast.rule_update_failed_title'), { description: String(err) });
    } finally {
      setUpdating(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this rule?')) return;
    try {
      await deleteCatRule(id);
      await loadRules();
      emitToastSuccess(t('ui.toast.rule_deleted_title'));
    } catch (err) {
      emitToastError(t('ui.toast.rule_delete_failed_title'), { description: String(err) });
    }
  };

  const handleTest = async () => {
    try {
      const res = await testCatRule(testPattern, samples.split('\n').filter(s => s.trim()));
      if (res.ok) {
        setTestResult({ matches: res.matches, misses: res.misses });
      } else {
        setTestResult({ matches: [], misses: [], error: res.error });
      }
    } catch (err) {
      setTestResult({ matches: [], misses: [], error: String(err) });
    }
  };

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading rules…</div>;
  }

  if (isError || !data) {
    return <div className="p-4 text-sm text-destructive">Failed to load rules.</div>;
  }

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-xl font-semibold">Category Rules</h2>

      {/* Rules List */}
      <div className="rounded-2xl border bg-card p-3">
        <div className="grid grid-cols-12 text-xs font-medium opacity-70 px-2 py-1">
          <div className="col-span-4">Pattern (regex)</div>
          <div className="col-span-3">Category</div>
          <div className="col-span-2">Priority</div>
          <div className="col-span-1">Enabled</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>
        <div className="divide-y">
          {data.map(r => (
            <div key={r.id} className="grid grid-cols-12 items-center gap-2 px-2 py-2">
              <input
                defaultValue={r.pattern}
                className="col-span-4 px-2 py-1 rounded border bg-background text-sm"
                onBlur={(e) => {
                  if (e.target.value !== r.pattern) {
                    void handleUpdate(r.id, { pattern: e.target.value });
                  }
                }}
                disabled={updating[r.id]}
              />
              <input
                defaultValue={r.category_slug}
                className="col-span-3 px-2 py-1 rounded border bg-background text-sm"
                onBlur={(e) => {
                  if (e.target.value !== r.category_slug) {
                    void handleUpdate(r.id, { category_slug: e.target.value });
                  }
                }}
                disabled={updating[r.id]}
              />
              <input
                type="number"
                defaultValue={r.priority}
                className="col-span-2 px-2 py-1 rounded border bg-background text-sm"
                onBlur={(e) => {
                  const newPriority = Number(e.target.value) || r.priority;
                  if (newPriority !== r.priority) {
                    void handleUpdate(r.id, { priority: newPriority });
                  }
                }}
                disabled={updating[r.id]}
              />
              <input
                type="checkbox"
                defaultChecked={r.enabled}
                className="col-span-1"
                onChange={(e) => {
                  void handleUpdate(r.id, { enabled: e.target.checked });
                }}
                disabled={updating[r.id]}
              />
              <div className="col-span-2 flex justify-end gap-2">
                <button
                  className="text-xs underline opacity-80 hover:opacity-100 disabled:opacity-50"
                  onClick={() => handleDelete(r.id)}
                  disabled={updating[r.id]}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rule Tester */}
      <div className="rounded-2xl border bg-card p-3 space-y-3">
        <h3 className="text-lg font-semibold">Test Rule Pattern</h3>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-sm font-medium">Test Pattern (regex)</label>
            <input
              value={testPattern}
              onChange={e => setTestPattern(e.target.value)}
              placeholder="e.g., SPOTIFY|APPLE\s*MUSIC|YTMUSIC"
              className="w-full px-2 py-1 rounded border bg-background text-sm mt-1"
            />
          </div>
          <Button onClick={handleTest} disabled={!testPattern.trim()}>
            Run Test
          </Button>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Samples (one per line)</label>
            <textarea
              value={samples}
              onChange={e => setSamples(e.target.value)}
              rows={6}
              className="w-full px-2 py-1 rounded border bg-background text-sm mt-1 font-mono"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Result</label>
            <div className="text-sm mt-1">
              {testResult?.error && (
                <div className="text-destructive mb-2">Error: {testResult.error}</div>
              )}
              {testResult && !testResult.error && (
                <>
                  <div className="mt-2">
                    <span className="font-medium">✓ Matches ({testResult.matches.length})</span>
                    {testResult.matches.length > 0 ? (
                      <ul className="list-disc ml-5 mt-1 text-xs font-mono">
                        {testResult.matches.map((m, i) => (
                          <li key={i} className="text-green-600 dark:text-green-400">{m}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground ml-5">None</p>
                    )}
                  </div>
                  <div className="mt-3">
                    <span className="font-medium">✗ Misses ({testResult.misses.length})</span>
                    {testResult.misses.length > 0 ? (
                      <ul className="list-disc ml-5 mt-1 text-xs font-mono">
                        {testResult.misses.map((m, i) => (
                          <li key={i} className="text-rose-600 dark:text-rose-400">{m}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground ml-5">None</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
