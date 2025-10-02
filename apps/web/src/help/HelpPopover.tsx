import React from "react";
import type { HelpEntry, HelpKey } from "./helpRegistry";
import { telemetry, describe, DescribeResponse } from "@/lib/api";
import { track } from "@/lib/analytics";
import { hashFilters } from "@/lib/hashFilters"; // if absent, fallback inside effect

function chartPreviewSlice(series: any, max = 6) {
  if (!series) return null;
  if (Array.isArray(series)) return series.slice(0, max);
  return null;
}

export default function HelpPopover(props: { rect: DOMRect; entry: HelpEntry; onClose: () => void; entryKey?: HelpKey }) {
  const { rect, entry, onClose, entryKey } = props;
  const top = Math.max(16, rect.top - 12 - 120);
  const left = Math.min(window.innerWidth - 380, Math.max(16, rect.left));
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    closeRef.current?.focus();
    // Telemetry: log help open (route + key)
    telemetry.helpOpen({ key: String(entryKey ?? entry.title), path: location.pathname, ts: Date.now() }).catch(() => {});
  }, []);

  const [desc, setDesc] = React.useState<DescribeResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    abortRef.current?.abort();
    const c = new AbortController();
    abortRef.current = c;
    setLoading(true);
    const t0 = performance.now();
    let fired = false;
    const panelId = String(entryKey || entry.title).replace(/\s+/g, '_').toLowerCase();
    const payload: any = { month: undefined, filters: undefined, meta: undefined, data: chartPreviewSlice((entry as any).data) };
    const filtersHash = (() => {
      try { return (hashFilters as any)?.(payload.filters) || 'none'; } catch { return 'none'; }
    })();
  const envDefault = (import.meta as any).env?.VITE_HELP_REPHRASE_DEFAULT === '0' ? false : true;
  const stored = sessionStorage.getItem('HELP_REPHRASE');
  const allowRephrase = stored ? stored === '1' : envDefault;
  describe(panelId, payload, { rephrase: allowRephrase, mode: allowRephrase ? 'explain' : 'learn', signal: c.signal })
      .then(r => {
        setDesc(r);
        if (!fired) {
          fired = true;
          const ttfb = Math.round(performance.now() - t0);
            track("help_shown", {
              panel: panelId,
              month: payload.month,
              filtersHash,
              grounded: !!r?.grounded,
              rephrased: !!r?.rephrased,
              provider: r?.provider || 'none',
              ttfb_ms: ttfb,
              sampleHint: (r as any)?.sample_hint ?? null,
            });
        }
      })
      .catch(() => {
        setDesc({ text: entry.body, grounded: true, rephrased: false, provider: 'none', panel_id: panelId, llm_called: false, mode: allowRephrase ? 'explain' : 'learn', reasons: [] });
        track("help_shown", { panel: panelId, error: true });
      })
      .finally(() => setLoading(false));
    return () => c.abort();
  }, [entryKey, entry]);

  const badges: string[] = [];
  const reasons = desc?.reasons || [];
  const fallbackReason = (desc as any)?.fallback_reason as string | undefined;
  const effectiveUnavailable = (desc as any)?.effective_unavailable === true;
  const aiCheckedNoChange = !!desc?.llm_called && !desc?.rephrased && (reasons.includes('identical_output') || fallbackReason === 'identical_output');
  if (desc?.grounded) badges.push('Grounded');
  if (desc?.rephrased) badges.push('AI‑polished');
  if (aiCheckedNoChange) badges.push('AI checked');
  if (!desc?.rephrased && reasons.includes('policy_blocked')) badges.push('Policy blocked');
  if (!desc?.rephrased && reasons.includes('no_data')) badges.push('No data');

  return (
    <div
      className="help-popover rounded-2xl shadow-lg p-4 bg-zinc-900/95 border border-zinc-700 fixed z-[70] max-w-[380px]"
      style={{ top, left }}
      role="dialog"
      aria-modal="true"
      aria-label={entry.title}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold mb-1 pr-2 leading-snug flex items-center gap-2">
          {entry.title}
          {reasons.includes('identical_output') && (
            <span
              title="Model output matched deterministic summary."
              className="inline-flex items-center justify-center w-4 h-4 text-[10px] rounded-full bg-zinc-800 text-zinc-300 border border-zinc-600 cursor-help"
            >i</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {badges.map(b => {
            let extra = '';
            if (b === 'Policy blocked') extra = 'bg-amber-800/40 text-amber-300 border-amber-600';
            else if (b === 'No data') extra = 'bg-zinc-800 text-zinc-400 border-zinc-600';
            else if (b === 'AI checked') extra = 'bg-zinc-800 text-zinc-200 border-zinc-600';
            else extra = 'bg-zinc-800 text-zinc-300 border-zinc-600';
            return (
              <span
                key={b}
                title={b === 'AI checked' ? 'AI reviewed but kept original wording.' : undefined}
                className={`rounded px-2 py-[2px] text-[10px] uppercase tracking-wide border ${extra}`}
              >
                {b}
              </span>
            );
          })}
        </div>
      </div>
      <div className="text-sm opacity-90 whitespace-pre-line min-h-[48px]">
        {loading ? (
          <span className="opacity-60">Loading…</span>
        ) : effectiveUnavailable ? (
          <span>The language model is temporarily unavailable. Showing deterministic description.</span>
        ) : (
          <>
            {desc?.text || entry.body}
            {aiCheckedNoChange && !effectiveUnavailable && (
              <div className="mt-2 text-[11px] opacity-60">AI reviewed the description; original wording was already clear.</div>
            )}
          </>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button ref={closeRef} className="text-xs opacity-80 hover:opacity-100 underline" onClick={onClose}>Close</button>
        <div className="text-[10px] opacity-50">
          Based on latest data · cached 5m
        </div>
      </div>
    </div>
  );
}
