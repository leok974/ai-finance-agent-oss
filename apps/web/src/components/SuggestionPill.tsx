import { useState, useRef, useEffect } from 'react';
import { applyCategory, promoteRule, rejectSuggestion, undoRejectSuggestion } from '@/lib/api';
import { emitToastSuccess, emitToastError } from '@/lib/toast-helpers';
import { t } from '@/lib/i18n'

export default function SuggestionPill({
  txn,
  s,
  isAdmin,
  onApplied,
  onRefreshSuggestions,
}: {
  txn: { id:number; merchant:string; merchant_canonical?:string; description:string; amount:number };
  s: { category_slug:string; label:string; score:number; why:string[] };
  isAdmin: boolean;
  onApplied: (id:number)=>void;
  onRefreshSuggestions?: (id:number)=>void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const popRef  = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        !pillRef.current?.contains(t) &&
        !menuRef.current?.contains(t) &&
        !popRef.current?.contains(t)
      ) {
        setMenuOpen(false);
        setExplainOpen(false);
      }
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setMenuOpen(false); setExplainOpen(false); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const mc = (txn.merchant_canonical ?? txn.merchant ?? '').toLowerCase();

  return (
    <div ref={pillRef} className="inline-flex items-center gap-2 relative">
      {/* Apply button */}
      <button
        className="inline-flex items-center gap-2 px-3 py-1 rounded-2xl border bg-background hover:shadow"
        title={(s.why || []).join(' • ')}
        onClick={async () => {
          await applyCategory(txn.id, s.category_slug);
          // toast.success(r.ack ?? `Categorized as ${s.label}`);
          onApplied(txn.id);
        }}
      >
        <span className="font-medium">{s.label}</span>
        <span className="text-xs opacity-70">{Math.round(s.score * 100)}%</span>
      </button>

      {/* Ellipsis */}
      <button
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className="w-6 h-6 rounded-full border bg-background text-sm leading-none hover:shadow"
        onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
      >⋯</button>

      {/* Menu */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute z-30 top-9 right-0 min-w-[200px] rounded-xl border bg-popover shadow-lg text-sm"
          role="menu"
        >
          <div className="py-1">
            {/* Explain now opens a popover */}
            <button
              role="menuitem"
              className="w-full text-left px-3 py-2 hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                setExplainOpen(v => !v);
              }}
            >
              Explain
            </button>

            {isAdmin && (
              <button
                role="menuitem"
                className="w-full text-left px-3 py-2 hover:bg-accent"
                onClick={async (e) => {
                  e.stopPropagation();
                  await promoteRule(mc, s.category_slug, 50);
                  // toast.success('Promoted to rule');
                  setMenuOpen(false);
                }}
              >
                Promote to rule
              </button>
            )}

            <button
              role="menuitem"
              className="w-full text-left px-3 py-2 hover:bg-accent text-destructive"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await rejectSuggestion(mc, s.category_slug);
                  emitToastSuccess(t('ui.toast.rule_ignored', { merchant: txn.merchant, category: s.label }), {
                    action: {
                      label: 'Undo',
                      onClick: async () => {
                        try {
                          await undoRejectSuggestion(mc, s.category_slug);
                          onRefreshSuggestions?.(txn.id);
                          emitToastSuccess(t('ui.toast.rule_accepted', { merchant: txn.merchant, category: s.label }));
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : String(err);
                          emitToastError(t('ui.toast.rule_accept_failed'), { description: msg });
                        }
                      }
                    }
                  });
                  onRefreshSuggestions?.(txn.id);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  emitToastError(t('ui.toast.rule_dismiss_failed'), { description: msg });
                }
                setMenuOpen(false);
              }}
            >
              Don’t suggest this
            </button>
          </div>
        </div>
      )}

      {/* Explain popover */}
      {explainOpen && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Suggestion explanation"
          className="absolute z-40 top-11 right-0 w-[280px] max-w-[80vw] rounded-xl border bg-popover shadow-xl p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Why this suggestion</div>
            <button
              aria-label="Close"
              className="w-6 h-6 rounded-full border bg-background text-sm leading-none hover:shadow"
              onClick={() => setExplainOpen(false)}
            >×</button>
          </div>

          {s.why?.length ? (
            <ul className="text-xs opacity-80 list-disc ml-4 space-y-1 break-words">
              {s.why.slice(0, 6).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-muted-foreground">No specific signals available.</div>
          )}

          <div className="mt-2 text-[11px] opacity-60">
            Tip: promote if this is correct for future {txn.merchant} charges.
          </div>
        </div>
      )}
    </div>
  );
}
