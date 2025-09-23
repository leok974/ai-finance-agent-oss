import * as React from "react";
import { useRef } from "react";
import {
  fetchRuleSuggestConfig,
  type RuleSuggestConfig,
  listRuleSuggestionsSummary,
  applyRuleSuggestion,
  ignoreRuleSuggestion,
  type MinedRuleSuggestion,
} from "@/api";
import { useCoalescedRefresh } from "@/utils/refreshBus";
import InfoDot from "@/components/InfoDot";
import { emitToastSuccess, emitToastError } from "@/lib/toast-helpers";
import Card from "./Card";
import { Skeleton } from "@/components/ui/skeleton";

type Suggestion = MinedRuleSuggestion;

export default function SuggestionsPanel() {
  const [rows, setRows] = React.useState<Suggestion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [recentMonth, setRecentMonth] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [cfg, setCfg] = React.useState<RuleSuggestConfig | null>(null);
  const ok = emitToastSuccess; const err = emitToastError;
  const errRef = React.useRef(err);
  React.useEffect(() => { errRef.current = err; }, [err]);
  const loadingRef = useRef(false);

  const refresh = React.useCallback(async () => {
    if (loadingRef.current) return; // prevent overlap
    loadingRef.current = true;
    setLoading(true);
    try {
      const data = await listRuleSuggestionsSummary({}); // { window_days, min_count, suggestions }
      const list = (data?.suggestions ?? []) as Suggestion[];
      setRows(list);
      // derive the most recent month key across suggestions
      const mk = list.find((s) => s.recent_month_key)?.recent_month_key ?? null;
      setRecentMonth(mk ?? null);
      setSelected(new Set());
    } catch (e) {
      // use ref to avoid re-creating callback and effect loops
  errRef.current?.("Could not fetch suggestions.", { description: "Failed to load" });
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // Coalesced refresh to batch rapid apply actions across this tab
  const scheduleSuggestionsRefresh = useCoalescedRefresh('suggestions-refresh', () => refresh(), 450);

  React.useEffect(() => {
    // run once on mount
    refresh();
  fetchRuleSuggestConfig().then(setCfg).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keyFor = (s: Suggestion) => `${s.merchant}||${s.category}`;
  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(key);
    else next.delete(key);
    setSelected(next);
  };
  const acceptOne = async (s: Suggestion) => {
    const key = keyFor(s);
    const nextPending = new Set(pending); nextPending.add(key); setPending(nextPending);
    try {
      const res = await applyRuleSuggestion({ merchant: s.merchant, category: s.category, backfill_month: s.recent_month_key ?? undefined });
  ok(`Rule created (#${res.rule_id})`, { description: `${s.merchant} → ${s.category}` });
      setRows((prev) => prev.filter((r) => keyFor(r) !== key));
      setSelected((prev) => { const c = new Set(prev); c.delete(key); return c; });
    } catch (e) {
  err("Failed to apply suggestion.", { description: "Action failed" });
    } finally {
      setPending((prev) => { const c = new Set(prev); c.delete(key); return c; });
    }
    scheduleSuggestionsRefresh();
  };

  const applySelected = async () => {
    const keys = Array.from(selected);
  if (keys.length === 0) return err("No rows selected", { description: "Select some suggestions first." });
    setBulkBusy(true);
    const mapByKey = new Map(rows.map((r) => [keyFor(r), r] as const));
    const targets = keys.map((k) => mapByKey.get(k)).filter(Boolean) as Suggestion[];
    const pend = new Set(pending); targets.forEach((t) => pend.add(keyFor(t))); setPending(pend);
    const results = await Promise.allSettled(targets.map((s) =>
      applyRuleSuggestion({ merchant: s.merchant, category: s.category, backfill_month: s.recent_month_key ?? undefined })
    ));
    const okCount = results.filter((r) => r.status === 'fulfilled').length;
    const failCount = results.length - okCount;
    setRows((prev) => prev.filter((r) => !keys.includes(keyFor(r))));
    setSelected(new Set());
    setPending(new Set());
  if (okCount) ok(`Applied ${okCount} ${okCount === 1 ? 'item' : 'items'}`, { description: failCount ? `${failCount} failed` : 'All succeeded' });
  if (!okCount && failCount) err('Nothing applied', { description: `${failCount} failed` });
    setBulkBusy(false);
    scheduleSuggestionsRefresh();
  };

  const ignoreOne = async (s: Suggestion) => {
    const key = keyFor(s);
    const nextPending = new Set(pending); nextPending.add(key); setPending(nextPending);
    try {
      await ignoreRuleSuggestion({ merchant: s.merchant, category: s.category });
      setRows((prev) => prev.filter((r) => keyFor(r) !== key));
  ok("Ignored", { description: `${s.merchant} → ${s.category}` });
    } catch (e) {
  err("Failed to ignore", { description: "Action failed" });
    } finally {
      setPending((prev) => { const c = new Set(prev); c.delete(key); return c; });
    }
    scheduleSuggestionsRefresh();
  };

  return (
    <section className="panel p-4 md:p-5">
    <div>
      {/* Header: title+tooltip left; actions pushed right */}
      <header className="flex items-center gap-3 pb-1 mb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">ML Suggestions</h3>
          <InfoDot title="Predicted categories with confidence. Review, select, apply or auto-apply." />
          {recentMonth && <span className="text-sm opacity-70">— {recentMonth}</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {cfg && (
            <span className="text-xs opacity-70 mr-2">
              feedback window: {cfg.window_days ?? "∞"}d
            </span>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh suggestions"
            title="Refresh suggestions"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => applySelected()}
            title="Apply checked suggestions"
            disabled={bulkBusy}
          >
            {bulkBusy ? 'Applying…' : `Apply selected${selected.size ? ` (${selected.size})` : ''}`}
          </button>
          {/* Auto-apply by confidence removed; mined suggestions have no probability */}
        </div>
      </header>

  {/* List */}
      <div className="space-y-2">
        {loading && (
          <div className="space-y-2">
            {[0,1,2,3].map(i => (
              <div key={i} className="rounded-xl border border-[hsl(var(--border))] bg-card/60 px-3 py-2">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-4 h-4 rounded" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-40" />
                    <div className="mt-1">
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-48" />
                </div>
              </div>
            ))}
          </div>
        )}
        {rows.map((r, idx) => {
          const key = keyFor(r);
          const disabled = pending.has(key);
          return (
          <div
            key={key || `${r.merchant}-${r.category}-${idx}`}
            className="panel-tight"
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="shrink-0 w-4 h-4 accent-[hsl(var(--primary))]"
                checked={selected.has(key)}
                onChange={(e) => toggle(key, e.target.checked)}
                aria-label={`Select ${r.merchant} → ${r.category}`}
              />
              <div className="min-w-0">
                <div className="font-medium truncate">{r.merchant || "—"}</div>
                <div className="text-xs opacity-70 truncate">{recentMonth ? `Most recent: ${recentMonth}` : " "}</div>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-sm">
                  <span className="opacity-70">Suggest: </span>
                  <span className="font-medium">{r.category}</span>
                  <span className="opacity-70"> · {r.count}× in {r.window_days}d</span>
                </span>
                <button
                  className="btn btn-sm"
                  title="Accept suggestion"
                  onClick={() => acceptOne(r)}
                  disabled={disabled}
                >
                  {disabled ? "Applying…" : "Accept"}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  title="Ignore this pair"
                  onClick={() => ignoreOne(r)}
                  disabled={disabled}
                >
                  Ignore
                </button>
              </div>
            </div>
          </div>
          );
        })}
  {!loading && rows.length === 0 && (
          <div className="text-sm opacity-70 py-4 text-center">No suggestions right now.</div>
        )}
      </div>
  </div>
  </section>
  );
}
