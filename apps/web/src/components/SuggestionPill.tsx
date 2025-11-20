import { applyCategory } from '@/lib/api';

export default function SuggestionPill({
  txn,
  s,
  disabled = false,
  onApplied,
}: {
  txn: { id:number; merchant:string; merchant_canonical?:string; description:string; amount:number };
  s: { category_slug:string; label:string; score:number; why:string[] };
  disabled?: boolean;
  onApplied: (id:number, categorySlug: string)=>void;
}) {
  const handleClick = async () => {
    if (disabled) return;

    console.log('[SuggestionPill] Starting categorization:', { txnId: txn.id, category: s.category_slug });
    
    try {
      // This is the real categorize call
      const result = await applyCategory(txn.id, s.category_slug);
      console.log('[SuggestionPill] Categorization succeeded:', result);

      // Notify parent so it can dismiss row + send feedback
      console.log('[SuggestionPill] Calling onApplied callback');
      onApplied(txn.id, s.category_slug);
      console.log('[SuggestionPill] onApplied callback completed');
    } catch (err) {
      console.error('[SuggestionPill] Failed to apply suggestion', err);
      // Error handling happens in parent
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
      disabled={disabled}
      onClick={handleClick}
    >
      <span className="font-medium">{s.label}</span>
      <span className="opacity-70">{Math.round(s.score * 100)}%</span>
    </button>
  );
}
