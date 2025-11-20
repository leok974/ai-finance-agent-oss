import { useState } from 'react';
import { categorizeTxn } from '@/api';

type SuggestionPillProps = {
  txn: { id: number; merchant: string; description: string; amount: number };
  s: { category_slug: string; label: string; score: number; why: string[] };
  disabled?: boolean;
  onApplied: (txnId: number, categorySlug: string) => void;
};

export default function SuggestionPill({
  txn,
  s,
  disabled = false,
  onApplied,
}: SuggestionPillProps) {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    if (pending || disabled) return;

    console.log('[SuggestionPill] Starting categorization:', { txnId: txn.id, category: s.category_slug });
    setPending(true);

    try {
      // Call the categorize endpoint
      await categorizeTxn(txn.id, s.category_slug);
      console.log('[SuggestionPill] Categorization succeeded');

      // Only on success, notify parent to dismiss row
      onApplied(txn.id, s.category_slug);
    } catch (err) {
      console.error('[SuggestionPill] Failed to apply suggestion', err);
      // Error handling: parent won't dismiss the row
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      className="
        inline-flex items-center gap-2 px-3 py-1 rounded-2xl border font-medium text-xs
        border-slate-700 bg-slate-900/80 text-slate-100
        hover:border-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-100
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950
        transition-all duration-150 ease-out
        hover:-translate-y-[1px] cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0
      "
      title={(s.why || []).join(' • ')}
      data-testid="uncat-suggestion-chip"
      disabled={pending || disabled}
      onClick={handleClick}
    >
      <span className="font-medium">{s.label}</span>
      <span className="opacity-70">{Math.round(s.score * 100)}%</span>
    </button>
  );
}
