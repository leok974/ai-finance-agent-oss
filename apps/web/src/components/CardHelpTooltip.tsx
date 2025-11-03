import * as React from 'react';
import { useState, useEffect, useRef, useId } from 'react';
import { agentDescribe } from '@/lib/api';
import { useLlmStore } from '@/state/llmStore';
import { Button, pillIconClass } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/**
 * CardHelpTooltip
 * Unified tooltip component that shows deterministic "what" help immediately
 * and optionally allows switching to a "why" rephrased explanation from the LLM.
 *
 * Props:
 *  - cardId: stable id for the card (matches backend card_id)
 *  - month: optional month string for context
 *  - ctx: optional context object (not used for deterministic What tab)
 *  - baseText: optional base summary text (deprecated, no longer used)
 *  - className: optional button class overrides
 */

const WHAT: Record<string, string> = {
  'cards.overview':
    'Shows total inflows (income), total outflows (spend), and net for the selected month. Values update after CSV ingest or month change.',
  'charts.top_categories':
    'Top spending categories for the selected month. Amounts are outflows (absolute value of negatives). Click a row to filter transactions.',
  'charts.month_merchants':
    'Top merchants by spend for the selected month. Helps identify where most money went.',
  'charts.daily_flows':
    'Daily net = income − spend for the selected month. Use it to spot spikes and streaks.',
  'charts.spending_trends':
    'Multi-month trend of total spend and/or net. Useful for seasonality and month-over-month changes.',
  'cards.forecast':
    'Forecast projects future net/in/out using your selected model, horizon, and confidence band.',
};

export interface CardHelpTooltipProps {
  cardId: string;
  month?: string | null;
  ctx?: Record<string, unknown>;
  baseText?: string | null;
  className?: string;
  variant?: 'icon' | 'text';
  autoOpenWhyOnShift?: boolean;
}

const WIDTH = 360;

export default function CardHelpTooltip({
  cardId,
  month,
  ctx: _ctx = {},
  baseText: _baseText = null,
  className = 'ml-2',
  variant = 'icon',
  autoOpenWhyOnShift = true,
}: CardHelpTooltipProps) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [activeTab, setActiveTab] = useState<'what' | 'why'>('what');
  const [why, setWhy] = useState<string | null>(null);
  const [whyErr, setWhyErr] = useState<string | null>(null);
  const popId = useId();

  const modelsOk = useLlmStore((s) => s.modelsOk);

  const what = WHAT[cardId] ?? 'This card explains a key metric for the selected month.';

  function position() {
    const rect = btnRef.current?.getBoundingClientRect();
    const padding = 8;
    setPos({
      top: (rect?.bottom || 0) + 8,
      left: Math.max(padding, Math.min(rect?.left || 0, window.innerWidth - WIDTH - padding)),
    });
  }

  useEffect(() => {
    setWhy(null);
    setWhyErr(null);
    if (!open || activeTab !== 'why' || !modelsOk) return;

    (async () => {
      try {
        const res = await agentDescribe(cardId, { month, stream: false }, { rephrase: true }) as { why?: string; reply?: string; text?: string };
        setWhy(res?.why ?? res?.reply ?? res?.text ?? null);
      } catch {
        setWhyErr('The language model is temporarily unavailable.');
      }
    })();
  }, [open, activeTab, cardId, month, modelsOk]);

  async function openPopover(e: React.MouseEvent) {
    const shift = e.shiftKey;
    position();
    setOpen(true);
    if (shift && autoOpenWhyOnShift && modelsOk) {
      setActiveTab('why');
    } else {
      setActiveTab('what');
    }
  }

  function closePopover() {
    setOpen(false);
    btnRef.current?.focus?.();
  }

  useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') closePopover();
    }
    function onDoc(ev: MouseEvent) {
      const target = ev.target as HTMLElement;
      const pop = document.querySelector('[data-popover-role="card-help"]');
      if (pop && !pop.contains(target) && btnRef.current && !btnRef.current.contains(target)) {
        closePopover();
      }
    }
    function onReposition() {
      position();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onDoc, true);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onDoc, true);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open]);

  const triggerLabel = variant === 'icon' ? '?' : t('ui.help.what');

  return (
    <>
      <button
        ref={btnRef}
        aria-label="Card help"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={open ? closePopover : openPopover}
        className={`${variant === 'icon' ? pillIconClass + ' h-5 w-5 text-[11px]' : 'text-xs underline decoration-dotted'} ${className}`}
        title={modelsOk ? `${t('ui.help.what')} (Shift+Click ${t('ui.help.why')})` : t('ui.help.what')}
      >
        {triggerLabel}
      </button>

      {open && (
        <div
          id={popId}
          data-popover-role="card-help"
          className="fixed z-[9999] w-[360px] rounded-xl border bg-background p-3 shadow-xl animate-in fade-in-0 zoom-in-95"
          style={{ top: pos.top, left: pos.left }}
          role="dialog"
        >
          <div className="flex items-center justify-between">
            <div className="font-medium">Card Help</div>
            <Button variant="pill-ghost" className="h-7 px-2 text-xs" onClick={closePopover}>
              {t('ui.help.close')}
            </Button>
          </div>
          <div className="mt-3 border-b pb-2 flex items-center gap-2 text-xs">
            <button
              onClick={() => setActiveTab('what')}
              className={`px-2 py-1 rounded-md ${activeTab === 'what' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
            >
              {t('ui.help.what')}
            </button>
            <button
              onClick={() => setActiveTab('why')}
              disabled={!modelsOk}
              className={`px-2 py-1 rounded-md ${activeTab === 'why' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'} ${!modelsOk ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {t('ui.help.why')}
            </button>
            {activeTab === 'what' && (
              <span className="ml-auto text-[10px] uppercase tracking-wide opacity-60">
                DETERMINISTIC
              </span>
            )}
          </div>
          <div className="mt-3 text-sm whitespace-pre-wrap max-h-[50vh] overflow-auto">
            {activeTab === 'what' && what}
            {activeTab === 'why' && !modelsOk && (
              <span className="text-muted-foreground">
                The language model is temporarily unavailable.
              </span>
            )}
            {activeTab === 'why' && modelsOk && !why && !whyErr && <span>Loading…</span>}
            {activeTab === 'why' && modelsOk && whyErr && (
              <span className="text-muted-foreground">{whyErr}</span>
            )}
            {activeTab === 'why' && modelsOk && why && why}
          </div>
        </div>
      )}
    </>
  );
}
