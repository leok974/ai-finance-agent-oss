import React from "react";
import Card from "./Card";
import SuggestionIgnoresPanel from "./SuggestionIgnoresPanel";
import { emitToastSuccess, emitToastError } from "@/lib/toast-helpers";
import {
  listPersistedSuggestions,
  acceptSuggestion,
  dismissSuggestion,
  listRuleSuggestionsPersistent,
  applyRuleSuggestion,
  ignoreRuleSuggestion,
} from "@/lib/api";
import type { RuleSuggestion } from "@/types/rules";
import HelpBadge from "./HelpBadge";

type RowModel =
  | ({ kind: "persisted"; id: number; status: "new" | "accepted" | "dismissed" } & Pick<RuleSuggestion, "merchant" | "category" | "count" | "window_days">)
  | ({ kind: "mined" } & RuleSuggestion);

export default function RuleSuggestionsPersistentPanel() {
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<RowModel[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [showIgnores, setShowIgnores] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const persisted = await listPersistedSuggestions();
      if (Array.isArray(persisted) && persisted.length) {
        const mapped: RowModel[] = persisted
          .filter(s => s.status === "new")
          .map(s => ({
            kind: "persisted",
            id: s.id,
            status: s.status,
            merchant: s.merchant,
            category: s.category,
            count: s.count ?? 0,
            window_days: s.window_days ?? 60,
          }));
        setRows(mapped);
      } else {
        const mined = await listRuleSuggestionsPersistent({ windowDays: 60, minCount: 3, maxResults: 25 });
        const arr = Array.isArray(mined?.suggestions) ? mined.suggestions : [];
        setRows(arr.map(s => ({ kind: "mined", ...s })));
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load suggestions");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <section className="panel p-4 md:p-5" data-explain-key="cards.rule_suggestions">
    <div>
      <header className="flex items-center gap-3 pb-1 mb-3 border-b border-border">
        <h3 className="text-base font-semibold flex items-center">
          Rule Suggestions
          <HelpBadge k="cards.rule_suggestions" className="ml-2" />
        </h3>
        <div className="ml-auto flex items-end gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowIgnores(v => !v)}
            title="Show ignored pairs"
          >{showIgnores ? 'Hide ignores' : 'Show ignores'}</button>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {loading && <div className="text-sm opacity-70">Loading…</div>}
      {error && <div className="text-sm text-red-500">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div className="px-3 py-6 text-center opacity-70">No suggestions right now.</div>
      )}

      <div className="space-y-2">
        {rows.map((s, i) => (
          <SuggestionRow key={`${s.kind}-${s.merchant}-${s.category}-${i}`} s={s} onChanged={load} />
        ))}
      </div>

      {showIgnores && (
        <div className="mt-6">
          <SuggestionIgnoresPanel />
        </div>
      )}
  </div>
  </section>
  );
}

function SuggestionRow({ s, onChanged }: { s: RowModel; onChanged: () => void }) {
  const [busy, setBusy] = React.useState<null | "apply" | "ignore" | "accept" | "dismiss">(null);

  const merchant = s.merchant ?? "—";
  const category = s.category ?? "—";
  const meta = <div className="text-xs opacity-70">Seen {s.count ?? 0}× in last {s.window_days ?? 60} days</div>;

  async function doAccept() {
    if (s.kind !== "persisted") return;
    setBusy("accept");
    try {
      await acceptSuggestion(s.id);
         emitToastSuccess(`Accepted: ${merchant} → ${category}`);
    } catch (e:any) {
  emitToastError(e?.message ?? "Failed to accept");
    } finally { setBusy(null); onChanged(); }
  }
  async function doDismiss() {
    if (s.kind !== "persisted") return;
    setBusy("dismiss");
    try {
      await dismissSuggestion(s.id);
         emitToastSuccess(`Dismissed: ${merchant} → ${category}`);
    } catch (e:any) {
  emitToastError(e?.message ?? "Failed to dismiss");
    } finally { setBusy(null); onChanged(); }
  }

  return (
    <div className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
      <div>
        <div className="font-medium">{merchant} → {category}</div>
        {meta}
      </div>

      {s.kind === "persisted" ? (
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-60"
            disabled={busy === "accept"}
            onClick={doAccept}
          >
            {busy === "accept" ? "Accepting…" : "Accept"}
          </button>
          <button
            className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-60"
            disabled={busy === "dismiss"}
            onClick={doDismiss}
          >
            {busy === "dismiss" ? "Dismissing…" : "Dismiss"}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-60"
            disabled={busy === "apply"}
            onClick={async () => {
              setBusy("apply");
              try {
                await applyRuleSuggestion({ merchant, category });
                emitToastSuccess(`Rule added: ${merchant} → ${category}`);
              } catch (e:any) {
                emitToastError(e?.message ?? "Failed to apply");
              } finally { setBusy(null); onChanged(); }
            }}
          >
            {busy === "apply" ? "Applying…" : "Apply"}
          </button>
          <button
            className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-60"
            disabled={busy === "ignore"}
            onClick={async () => {
              setBusy("ignore");
              try {
                await ignoreRuleSuggestion({ merchant, category });
                  emitToastSuccess(`Ignored ${merchant} → ${category}`);
              } catch (e:any) {
                  emitToastError(e?.message ?? "Failed to ignore");
              } finally { setBusy(null); onChanged(); }
            }}
          >
            {busy === "ignore" ? "Ignoring…" : "Ignore"}
          </button>
        </div>
      )}
    </div>
  );
}
