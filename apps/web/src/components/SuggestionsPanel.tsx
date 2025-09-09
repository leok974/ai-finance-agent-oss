import * as React from "react";
import { useRef } from "react";
import { getSuggestions, categorizeTxn, mlFeedback } from "@/api";
import { useCoalescedRefresh } from "@/utils/refreshBus";
import InfoDot from "@/components/InfoDot";
import { useOkErrToast } from "@/lib/toast-helpers";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import Card from "./Card";
import LearnedBadge from "./LearnedBadge";

type Candidate = { label: string; confidence: number };
type Suggestion = {
  txn_id: number;
  merchant?: string | null;
  description?: string | null;
  candidates?: Candidate[]; // new backend shape
  topk?: Candidate[];       // tolerate legacy alias
};

export default function SuggestionsPanel() {
  const [rows, setRows] = React.useState<Suggestion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [month, setMonth] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [threshold, setThreshold] = React.useState<number>(0.85);
  const [pending, setPending] = React.useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const { ok, err } = (useOkErrToast as any)?.() ?? { ok: console.log, err: console.error };
  const errRef = React.useRef(err);
  React.useEffect(() => { errRef.current = err; }, [err]);
  const [learned, setLearned] = React.useState<Record<number, boolean>>({});
  const loadingRef = useRef(false);

  const refresh = React.useCallback(async () => {
    if (loadingRef.current) return; // prevent overlap
    loadingRef.current = true;
    setLoading(true);
    try {
      const data = await getSuggestions(); // { month, suggestions }
      setMonth(data?.month ?? null);
      setRows((data?.suggestions ?? []) as Suggestion[]);
      setSelected(new Set());
    } catch (e) {
      // use ref to avoid re-creating callback and effect loops
      errRef.current?.("Could not fetch suggestions.", "Failed to load");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: number, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  const topCandidate = (s: Suggestion): Candidate | undefined =>
    (Array.isArray(s.candidates) ? s.candidates : Array.isArray(s.topk) ? s.topk : [])?.[0];

  const acceptOne = async (s: Suggestion, source: "accept_suggestion" | "auto_apply") => {
    const id = s.txn_id;
    const top = topCandidate(s);
    if (!top) return err("No candidate to apply.", "Cannot apply");
    const nextPending = new Set(pending); nextPending.add(id); setPending(nextPending);
    try {
  await categorizeTxn(id, top.label);
  await mlFeedback({ txn_id: id, merchant: s.merchant ?? '', category: top.label, action: 'accept' });
      // Show transient learned badge
      setLearned(prev => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setLearned(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }, 4500);
      // remove from UI
      setRows((prev) => prev.filter((r) => r.txn_id !== id));
      setSelected((prev) => { const c = new Set(prev); c.delete(id); return c; });
      ok(
        `Applied ${top.label}`,
        `Transaction ${id} from ${s.merchant ?? "—"} categorized`
      );
    } catch (e) {
      err("Failed to apply suggestion.", "Action failed");
    } finally {
      setPending((prev) => { const c = new Set(prev); c.delete(id); return c; });
    }
  // Trigger a batched refresh after local UI updates
  scheduleSuggestionsRefresh();
  };

  const applySelected = async ({ force = true }: { force?: boolean } = {}) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return err("No rows selected", "Select some suggestions first.");
    const mapById = new Map(rows.map((r) => [r.txn_id, r] as const));
    const chosen = ids
      .map((id) => mapById.get(id))
      .filter(Boolean)
      .map((s) => s as Suggestion);
    const targets = force ? chosen : chosen.filter((s) => (topCandidate(s)?.confidence ?? 0) >= threshold);
    const skippedCount = force ? 0 : (chosen.length - targets.length);
    if (targets.length === 0) return err("Nothing to apply", `${skippedCount} skipped, 0 applied`);
    setBulkBusy(true);
    const pend = new Set(pending); targets.forEach((t) => pend.add(t.txn_id)); setPending(pend);
    const results = await Promise.allSettled(targets.map((s) =>
      (async () => {
  const top = topCandidate(s)!; // filtered above
  await categorizeTxn(s.txn_id, top.label);
  await mlFeedback({ txn_id: s.txn_id, merchant: s.merchant ?? '', category: top.label, action: 'accept' });
        // mark learned
        setLearned(prev => ({ ...prev, [s.txn_id]: true }));
        setTimeout(() => {
          setLearned(prev => {
            const next = { ...prev };
            delete next[s.txn_id];
            return next;
          });
        }, 4500);
        return s.txn_id;
      })()
    ));
  const successIds = results.filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled').map(r => r.value);
  const failCount = results.length - successIds.length;
    setRows((prev) => prev.filter((r) => !successIds.includes(r.txn_id)));
    setSelected((prev) => { const c = new Set(prev); successIds.forEach((id) => c.delete(id)); return c; });
    setPending((prev) => { const c = new Set(prev); targets.forEach((t) => c.delete(t.txn_id)); return c; });
    const okCount = successIds.length;
    if (okCount) {
      ok(`Applied ${okCount} ${okCount === 1 ? 'item' : 'items'}`, skippedCount || failCount ? `${skippedCount} skipped, ${failCount} failed` : 'All succeeded');
    }
    if (!okCount && (skippedCount || failCount)) {
      err('Nothing applied', `${skippedCount} skipped, ${failCount} failed`);
    }
    setBulkBusy(false);
  // Refresh once after batch apply
  scheduleSuggestionsRefresh();
  };

  const autoApply = async (minConf: number) => {
    setThreshold(minConf);
    const targets = rows.filter((s) => (topCandidate(s)?.confidence ?? 0) >= minConf);
    if (targets.length === 0) return ok("No suggestions above threshold.", "Auto-apply");
    const pend = new Set(pending); targets.forEach((t) => pend.add(t.txn_id)); setPending(pend);
    const results = await Promise.allSettled(targets.map((s) =>
      (async () => {
        const top = topCandidate(s)!;
  await categorizeTxn(s.txn_id, top.label);
  await mlFeedback({ txn_id: s.txn_id, merchant: s.merchant ?? '', category: top.label, action: 'accept' });
        // mark learned
        setLearned(prev => ({ ...prev, [s.txn_id]: true }));
        setTimeout(() => {
          setLearned(prev => {
            const next = { ...prev };
            delete next[s.txn_id];
            return next;
          });
        }, 4500);
        return s.txn_id;
      })()
    ));
    const successIds = results.filter((r): r is PromiseFulfilledResult<number> => r.status === 'fulfilled').map(r => r.value);
    const failCount = results.length - successIds.length;
    setRows((prev) => prev.filter((r) => !successIds.includes(r.txn_id)));
    setSelected((prev) => { const c = new Set(prev); successIds.forEach((id) => c.delete(id)); return c; });
    setPending((prev) => { const c = new Set(prev); targets.forEach((t) => c.delete(t.txn_id)); return c; });
  ok(`Auto-applied ${successIds.length}${failCount ? `, ${failCount} failed` : ''}.`, "Auto-apply");
  // Refresh once after auto-apply
  scheduleSuggestionsRefresh();
  };

  return (
    <Card>
      {/* Header: title+tooltip left; actions pushed right */}
      <header className="flex items-center gap-3 pb-1 mb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">ML Suggestions</h3>
          <InfoDot title="Predicted categories with confidence. Review, select, apply or auto-apply." />
          {month && <span className="text-sm opacity-70">— {month}</span>}
        </div>
        <div className="ml-auto flex items-center gap-2">
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
            onClick={() => applySelected({ force: true })}
            title="Apply checked suggestions"
            disabled={bulkBusy}
          >
            {bulkBusy ? 'Applying…' : `Apply selected${selected.size ? ` (${selected.size})` : ''}`}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="btn btn-ghost btn-sm" title="Auto-apply the highest-confidence suggestions">
                Auto-apply ≥ {threshold.toFixed(2)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px] z-[60]">
              {[0.8, 0.85, 0.9, 0.95].map((t) => (
                <DropdownMenuItem
                  key={t}
                  className="justify-between"
                  onClick={() => autoApply(t)}
                >
                  ≥ {t.toFixed(2)}
                  {t === threshold && <span className="text-xs opacity-70">current</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

  {/* List */}
      <div className="space-y-2">
        {rows.map((r, idx) => {
          const id = r.txn_id;
          const cand = topCandidate(r);
          const disabled = pending.has(id);
          return (
          <div
            key={id ?? `${r.merchant ?? 'm'}-${(r as any)?.date ?? 'd'}-${(r as any)?.amount ?? 'a'}-${idx}`}
            className="rounded-xl border border-[hsl(var(--border))] bg-card/60 px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="shrink-0 w-4 h-4 accent-[hsl(var(--primary))]"
                checked={selected.has(id)}
                onChange={(e) => toggle(id, e.target.checked)}
                aria-label={`Select ${r.merchant ?? "transaction"}`}
              />
              <div className="min-w-0">
                <div className="font-medium truncate">{r.merchant || "—"}</div>
                <div className="text-xs opacity-70 truncate">{r.description || " "}</div>
              </div>
              {cand && (
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-sm">
                    <span className="opacity-70">Suggest: </span>
                    <span className="font-medium">{cand.label}</span>
                    <span className="opacity-70"> · {cand.confidence.toFixed(2)}</span>
                  </span>
                  <button
                    className="btn btn-sm"
                    title="Accept suggestion"
                    onClick={() => acceptOne(r, "accept_suggestion")}
                    disabled={disabled}
                  >
                    {disabled ? "Applying…" : "Accept"}
                  </button>
                  {learned[id] && <LearnedBadge />}
                </div>
              )}
            </div>
          </div>
          );
        })}
        {rows.length === 0 && (
          <div className="text-sm opacity-70 py-4 text-center">No suggestions right now.</div>
        )}
      </div>
  </Card>
  );
}
