import * as React from 'react';
import { useState, useEffect, useRef, useId } from 'react';
import { fetchCardExplain } from '@/lib/agent/explain';
import { fetchAgentStatus } from '@/lib/agent/status';
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
  const [loadingWhy, setLoadingWhy] = useState(false);
  const [llmStatus, setLlmStatus] = useState<{ llm_ok: boolean } | null>(null);
  const popId = useId();

  const modelsOk = useLlmStore((s) => s.modelsOk);

  const what = WHAT[cardId] ?? 'This card explains a key metric for the selected month.';

  // Check LLM status on mount
  useEffect(() => {
    let alive = true;
    fetchAgentStatus().then((s) => alive && setLlmStatus({ llm_ok: !!s?.llm_ok }));
    return () => { alive = false; };
  }, []);

  function position() {
    const rect = btnRef.current?.getBoundingClientRect();
    const padding = 8;
    setPos({
      top: (rect?.bottom || 0) + 8,
      left: Math.max(padding, Math.min(rect?.left || 0, window.innerWidth - WIDTH - padding)),
    });
  }

  // Fetch explanation when switching to "why" tab
  async function ensureExplain() {
    if (why || loadingWhy || whyErr) return;

    setLoadingWhy(true);
    setWhyErr(null);

    try {
      const res = await fetchCardExplain({ cardId, month });
      if (res?.explain) {
        setWhy(res.explain);
      } else {
        setWhyErr('No explanation available.');
      }
    } catch {
      setWhyErr('The language model is temporarily unavailable.');
    } finally {
      setLoadingWhy(false);
    }
  }

  // Switch to Why tab and try to load explanation
  async function switchToWhy() {
    setActiveTab('why');
    await ensureExplain();
  }

  async function openPopover(e: React.MouseEvent) {
    const shift = e.shiftKey;
    position();
    setOpen(true);
    if (shift && autoOpenWhyOnShift && (modelsOk || llmStatus?.llm_ok)) {
      await switchToWhy();
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

  // Determine why state for rendering
  const whyState = React.useMemo(() => {
    if (loadingWhy) return { kind: 'loading' } as const;
    if (why) return { kind: 'ready' as const, explain: why };
    if (whyErr) return { kind: 'error' as const, message: whyErr };
    if (!modelsOk && !llmStatus?.llm_ok) {
      return { kind: 'fallback' as const, reason: 'llm_unavailable' };
    }
    return { kind: 'empty' } as const;
  }, [loadingWhy, why, whyErr, modelsOk, llmStatus?.llm_ok]);

  return (
    <>
      <button
        ref={btnRef}
        aria-label="Card help"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={open ? closePopover : openPopover}
        className={`${variant === 'icon' ? pillIconClass + ' h-5 w-5 text-[11px]' : 'text-xs underline decoration-dotted'} ${className}`}
        title={modelsOk || llmStatus?.llm_ok ? `${t('ui.help.what')} (Shift+Click ${t('ui.help.why')})` : t('ui.help.what')}
      >
        {triggerLabel}
      </button>

      {open && (
        <div
          id={popId}
          data-popover-role="card-help"
          className="fixed z-[9999] w-[360px] rounded-xl border bg-background p-3 shadow-xl animate-in fade-in-0 zoom-in-95 pointer-events-auto"
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
            {/* 🔑 Always clickable - removed disabled attribute */}
            <button
              onClick={switchToWhy}
              className={`px-2 py-1 rounded-md ${activeTab === 'why' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
              aria-label="Why is this value what it is?"
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

            {activeTab === 'why' && whyState.kind === 'loading' && (
              <div className="text-muted-foreground">Fetching an explanation…</div>
            )}

            {activeTab === 'why' && whyState.kind === 'ready' && (
              <div>{whyState.explain}</div>
            )}

            {activeTab === 'why' && whyState.kind === 'error' && (
              <div className="space-y-3">
                <p className="text-muted-foreground">{whyState.message}</p>
                <div className="flex gap-2">
                  <Button
                    variant="pill"
                    size="sm"
                    onClick={() => {
                      setWhy(null);
                      setWhyErr(null);
                      ensureExplain();
                    }}
                  >
                    Try again
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'why' && whyState.kind === 'fallback' && (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  An explanation isn't available right now because the language model is unavailable.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="pill"
                    size="sm"
                    onClick={() => {
                      // Dispatch event to open chat with prefilled message
                      window.dispatchEvent(new CustomEvent('agent:prefill', {
                        detail: {
                          message: `Explain ${cardId} for ${month ?? 'the current month'} and cite sources.`,
                        }
                      }));
                      closePopover();
                    }}
                  >
                    Ask the agent
                  </Button>
                  {llmStatus?.llm_ok && (
                    <Button
                      variant="pill-outline"
                      size="sm"
                      onClick={ensureExplain}
                    >
                      Re-run now
                    </Button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'why' && whyState.kind === 'empty' && (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  No explanation attached yet. Want me to generate one?
                </p>
                <Button
                  variant="pill"
                  size="sm"
                  onClick={ensureExplain}
                >
                  Generate explanation
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
