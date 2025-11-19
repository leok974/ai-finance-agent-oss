import { applyCategory } from '@/lib/api';

export default function SuggestionPill({
  txn,
  s,
  onApplied,
}: {
  txn: { id:number; merchant:string; merchant_canonical?:string; description:string; amount:number };
  s: { category_slug:string; label:string; score:number; why:string[] };
  onApplied: (id:number)=>void;
}) {
  return (
    <button
      className="
        inline-flex items-center gap-2 px-3 py-1 rounded-2xl border font-medium text-xs
        border-slate-700 bg-slate-900/80 text-slate-100
        hover:border-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-100
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950
        transition-all duration-150 ease-out
        hover:-translate-y-[1px] cursor-pointer
      "
      title={(s.why || []).join(' • ')}
      onClick={async () => {
        await applyCategory(txn.id, s.category_slug);
        onApplied(txn.id);
      }}
    >
      <span className="font-medium">{s.label}</span>
      <span className="opacity-70">{Math.round(s.score * 100)}%</span>
    </button>
  );
}
