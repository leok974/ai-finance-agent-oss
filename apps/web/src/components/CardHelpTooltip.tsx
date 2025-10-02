import * as React from 'react';
import { getHelp } from '@/lib/helpTooltip';
import { Button, pillIconClass } from '@/components/ui/button';
import { t } from '@/lib/i18n';

/**
 * CardHelpTooltip
 * Unified tooltip component that can show deterministic "what" help immediately
 * and optionally allow switching to a "why" rephrased explanation.
 *
 * Props:
 *  - cardId: stable id for caching (matches backend card_id)
 *  - month: optional month string for context
 *  - ctx: deterministic context object (mirrors render data; must be JSON-serializable)
 *  - baseText: optional base summary text (required for why mode)
 *  - className: optional button class overrides
 */
export interface CardHelpTooltipProps {
  cardId: string;
  month?: string | null;
  ctx?: any;
  baseText?: string | null;
  className?: string;
  variant?: 'icon' | 'text';
  autoOpenWhyOnShift?: boolean; // if true, Shift+Click jumps directly to why
}

interface HelpState {
  mode: 'what' | 'why';
  source?: string;
  text: string;
  etag?: string;
  cached?: boolean;
  stale?: boolean;
  error?: string;
}

const WIDTH = 360;

export default function CardHelpTooltip({
  cardId,
  month,
  ctx = {},
  baseText = null,
  className = 'ml-2',
  variant = 'icon',
  autoOpenWhyOnShift = true,
}: CardHelpTooltipProps) {
  const btnRef = React.useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const [loadingWhat, setLoadingWhat] = React.useState(false);
  const [loadingWhy, setLoadingWhy] = React.useState(false);
  const [data, setData] = React.useState<HelpState | null>(null);
  const [whyData, setWhyData] = React.useState<HelpState | null>(null);
  const [activeTab, setActiveTab] = React.useState<'what' | 'why'>('what');
  const popId = React.useId();

  function position() {
    const rect = btnRef.current?.getBoundingClientRect();
    const padding = 8;
    setPos({
      top: (rect?.bottom || 0) + 8,
      left: Math.max(padding, Math.min(rect?.left || 0, window.innerWidth - WIDTH - padding)),
    });
  }

  async function fetchMode(mode: 'what' | 'why') {
    const existing = mode === 'what' ? data : whyData;
    if (existing && !existing.stale) return;
    const setLoading = mode === 'what' ? setLoadingWhat : setLoadingWhy;
    setLoading(true);
    try {
      const resp: any = await getHelp({
        cardId,
        mode,
        month: month || undefined,
        ctx,
        baseText: mode === 'why' ? baseText || '(no base text provided)' : undefined,
      });
      const payload: HelpState = {
        mode,
        source: resp.source,
        text: resp.text,
        etag: resp.etag,
        cached: resp.cached,
        stale: resp.stale,
        error: resp.error,
      };
      if (mode === 'what') setData(payload); else setWhyData(payload);
    } catch (e: any) {
      const payload: HelpState = {
        mode,
        text: 'Help unavailable.',
        error: e?.message || String(e),
      };
      if (mode === 'what') setData(payload); else setWhyData(payload);
    } finally {
      setLoading(false);
    }
  }

  async function openPopover(e: React.MouseEvent) {
    const shift = e.shiftKey;
    position();
    setOpen(true);
    if (shift && autoOpenWhyOnShift && baseText) {
      setActiveTab('why');
      await fetchMode('why');
    } else {
      await fetchMode('what');
    }
  }

  function closePopover() {
    setOpen(false);
    btnRef.current?.focus?.();
  }

  React.useEffect(() => {
    if (!open) return;
    function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') closePopover(); }
    function onDoc(ev: MouseEvent) {
      const t = ev.target as HTMLElement;
      const pop = document.querySelector('[data-popover-role="card-help"]');
      if (pop && !pop.contains(t) && btnRef.current && !btnRef.current.contains(t)) {
        closePopover();
      }
    }
    function onReposition() { position(); }
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

  async function onSwitch(mode: 'what' | 'why') {
    setActiveTab(mode);
    await fetchMode(mode);
  }

  const showWhy = !!baseText; // only enable why tab if base text provided

  const triggerLabel = variant === 'icon' ? '?' : t('ui.help.what'); // reuse 'What' as generic label when variant=text

  return (
    <>
      <button
        ref={btnRef}
        aria-label="Card help"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={open ? closePopover : openPopover}
        className={`${variant === 'icon' ? pillIconClass + ' h-5 w-5 text-[11px]' : 'text-xs underline decoration-dotted'} ${className}`}
  title={showWhy ? `${t('ui.help.what')} (Shift+Click ${t('ui.help.why')})` : t('ui.help.what')}
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
            <Button variant="pill-ghost" className="h-7 px-2 text-xs" onClick={closePopover}>{t('ui.help.close')}</Button>
          </div>
          <div className="mt-3 border-b pb-2 flex items-center gap-2 text-xs">
            <button
              onClick={() => onSwitch('what')}
              className={`px-2 py-1 rounded-md ${activeTab === 'what' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
            >{t('ui.help.what')}</button>
            {showWhy && (
              <button
                onClick={() => onSwitch('why')}
                className={`px-2 py-1 rounded-md ${activeTab === 'why' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
              >{t('ui.help.why')}</button>
            )}
            {(activeTab === 'why' ? whyData : data)?.source && (
              <span className="ml-auto text-[10px] uppercase tracking-wide opacity-60">
                {(activeTab === 'why' ? whyData : data)?.source}
              </span>
            )}
          </div>
          <div className="mt-3 text-sm whitespace-pre-wrap max-h-[50vh] overflow-auto">
            {activeTab === 'what' && loadingWhat && !data && 'Loading…'}
            {activeTab === 'why' && loadingWhy && !whyData && 'Loading…'}
            {activeTab === 'what' && !loadingWhat && data?.text}
            {activeTab === 'why' && !loadingWhy && whyData?.text}
          </div>
          {showWhy && activeTab === 'why' && whyData?.error && (
            <div className="mt-2 text-xs text-rose-400">{whyData.error}</div>
          )}
        </div>
      )}
    </>
  );
}
