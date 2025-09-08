import * as React from "react";
import { getSuggestions } from "@/api";
import InfoDot from "@/components/InfoDot";
import { useOkErrToast } from "@/lib/toast-helpers";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import Card from "./Card";

type Suggestion = {
  id: number;
  merchant?: string;
  description?: string;
  confidence?: number;
};

export default function SuggestionsPanel() {
  const [rows, setRows] = React.useState<Suggestion[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [month, setMonth] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [threshold, setThreshold] = React.useState<number>(0.85);
  const { ok, err } = useOkErrToast();

  async function refresh() {
    setLoading(true);
    try {
      const data = await getSuggestions(); // should return { month, suggestions }
      setMonth(data?.month ?? null);
      setRows(data?.suggestions ?? []);
    } catch (e) {
      err("Could not fetch suggestions.", "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
  }, []);

  const toggle = (id: number, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  const applySelected = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return ok("No suggestions selected.", "Nothing to apply");
    ok(`Would apply ${ids.length} selected suggestion(s).`, "Apply selected");
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
            onClick={applySelected}
            title="Apply checked suggestions"
          >
            Apply selected
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
                  onClick={() => {
                    setThreshold(t);
                    ok(`Would auto-apply suggestions with confidence ≥ ${t.toFixed(2)}.`, "Auto-apply");
                  }}
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
        {rows.map((r, idx) => (
          <div
            key={(r as any)?.id ?? (r as any)?.txn_id ?? `${r.merchant ?? 'm'}-${(r as any)?.date ?? 'd'}-${(r as any)?.amount ?? 'a'}-${idx}`}
            className="rounded-xl border border-[hsl(var(--border))] bg-card/60 px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                className="shrink-0 w-4 h-4 accent-[hsl(var(--primary))]"
                checked={selected.has(r.id)}
                onChange={(e) => toggle(r.id, e.target.checked)}
                aria-label={`Select ${r.merchant ?? "transaction"}`}
              />
              <div className="min-w-0">
                <div className="font-medium truncate">{r.merchant || "—"}</div>
                <div className="text-xs opacity-70 truncate">{r.description || " "}</div>
              </div>
              <div className="ml-auto">
                <button className="btn btn-ghost btn-sm" title="Explain this suggestion">
                  Explain
                </button>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="text-sm opacity-70 py-4 text-center">No suggestions right now.</div>
        )}
      </div>
  </Card>
  );
}
