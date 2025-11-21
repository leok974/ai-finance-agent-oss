import { useState } from 'react';
import { categorizeTxn } from '@/api';
import clsx from 'clsx';
import { getSuggestionConfidencePercent } from '../lib/suggestions';

type SuggestionPillProps = {
  txn: { id: number; merchant: string; description: string; amount: number };
  s: {
    category_slug: string;
    label: string;
    score: number;
    why: string[];
    feedback_accepts?: number | null;
    feedback_rejects?: number | null;
    feedback_ratio?: number | null;
  };
  disabled?: boolean;
  onApplied: (txnId: number, categorySlug: string, suggestionLabel?: string, txnMerchant?: string) => void;
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

      // Only on success, notify parent to dismiss row with full context
      onApplied(txn.id, s.category_slug, s.label, txn.merchant || txn.description);
    } catch (err) {
      console.error('[SuggestionPill] Failed to apply suggestion', err);
      // Error handling: parent won't dismiss the row
    } finally {
      setPending(false);
    }
  };

  // Calculate learning indicator state
  const accepts = s.feedback_accepts ?? 0;
  const rejects = s.feedback_rejects ?? 0;
  const total = accepts + rejects;
  const isLearning = total > 0;
  const isMostlyPositive = total > 0 && (accepts / total) >= 0.6;

  // Build tooltip for learning indicator
  const learningTooltip = isLearning
    ? rejects === 0
      ? `Learning from ${accepts} confirm${accepts === 1 ? '' : 's'}`
      : `Learning from ${accepts} confirm${accepts === 1 ? '' : 's'} and ${rejects} correction${rejects === 1 ? '' : 's'}`
    : '';

  return (
    <button
      type="button"
      className="
        relative inline-flex items-center gap-2 px-3 py-1 rounded-2xl border font-medium text-xs
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
      <span className="opacity-70">{getSuggestionConfidencePercent(s)}%</span>

      {/* Learning indicator bar */}
      {isLearning && (
        <div
          className="absolute inset-x-1 bottom-0 h-0.5 rounded-full"
          title={learningTooltip}
        >
          <div
            className={clsx(
              'h-full w-full rounded-full transition-colors',
              isMostlyPositive ? 'bg-emerald-400/70' : 'bg-amber-400/70'
            )}
          />
        </div>
      )}
    </button>
  );
}
