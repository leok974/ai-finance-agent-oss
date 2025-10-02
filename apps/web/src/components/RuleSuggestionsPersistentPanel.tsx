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
import CardHelpTooltip from "./CardHelpTooltip";
import { getHelpBaseText } from '@/lib/helpBaseText';
import { Button } from "@/components/ui/button";
import { t } from '@/lib/i18n';

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
          {t('ui.rule_suggestions.title')}
          <CardHelpTooltip cardId="cards.rule_suggestions" ctx={{ rows }} baseText={getHelpBaseText('cards.rule_suggestions')} className="ml-2" />
        </h3>
        <div className="ml-auto flex items-end gap-2">
          <Button
            variant="pill-outline"
            size="sm"
            onClick={() => setShowIgnores(v => !v)}
            title={t('ui.rule_suggestions.show_ignores')}
          >
            {showIgnores ? t('ui.rule_suggestions.hide_ignores') : t('ui.rule_suggestions.show_ignores')}
          </Button>
          <Button variant="pill-outline" size="sm" onClick={load} disabled={loading}>
            {loading ? t('ui.rule_suggestions.refreshing') : t('ui.rule_suggestions.refresh')}
          </Button>
        </div>
      </header>

  {loading && <div className="text-sm opacity-70">{t('ui.rule_suggestions.loading')}</div>}
      {error && <div className="text-sm text-red-500">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <div className="px-3 py-6 text-center opacity-70">{t('ui.rule_suggestions.none')}</div>
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
  const meta = <div className="text-xs opacity-70">{t('ui.rule_suggestions.seen_meta', { count: s.count ?? 0, days: s.window_days ?? 60 })}</div>;

  async function doAccept() {
    if (s.kind !== "persisted") return;
    setBusy("accept");
    try {
      await acceptSuggestion(s.id);
         emitToastSuccess(t('ui.toast.rule_accepted', { merchant, category }));
    } catch (e:any) {
  emitToastError(e?.message ?? t('ui.toast.rule_accept_failed'));
    } finally { setBusy(null); onChanged(); }
  }
  async function doDismiss() {
    if (s.kind !== "persisted") return;
    setBusy("dismiss");
    try {
      await dismissSuggestion(s.id);
         emitToastSuccess(t('ui.toast.rule_dismissed', { merchant, category }));
    } catch (e:any) {
  emitToastError(e?.message ?? t('ui.toast.rule_dismiss_failed'));
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
          <Button variant="pill-success" size="sm" disabled={busy === "accept"} onClick={doAccept}>
            {busy === "accept" ? t('ui.rule_suggestions.accepting') : t('ui.rule_suggestions.accept')}
          </Button>
          <Button variant="pill-danger" size="sm" disabled={busy === "dismiss"} onClick={doDismiss}>
            {busy === "dismiss" ? t('ui.rule_suggestions.dismissing') : t('ui.rule_suggestions.dismiss')}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            variant="pill-primary"
            size="sm"
            disabled={busy === "apply"}
            onClick={async () => {
              setBusy("apply");
              try {
                await applyRuleSuggestion({ merchant, category });
                emitToastSuccess(t('ui.toast.rule_added', { merchant, category }));
              } catch (e:any) {
                emitToastError(e?.message ?? t('ui.toast.rule_apply_failed'));
              } finally { setBusy(null); onChanged(); }
            }}
          >
            {busy === "apply" ? t('ui.rule_suggestions.applying') : t('ui.rule_suggestions.apply')}
          </Button>
          <Button
            variant="pill-outline"
            size="sm"
            disabled={busy === "ignore"}
            onClick={async () => {
              setBusy("ignore");
              try {
                await ignoreRuleSuggestion({ merchant, category });
                  emitToastSuccess(t('ui.toast.rule_ignored', { merchant, category }));
              } catch (e:any) {
                  emitToastError(e?.message ?? t('ui.toast.rule_ignore_failed'));
              } finally { setBusy(null); onChanged(); }
            }}
          >
            {busy === "ignore" ? t('ui.rule_suggestions.ignoring') : t('ui.rule_suggestions.ignore')}
          </Button>
        </div>
      )}
    </div>
  );
}
