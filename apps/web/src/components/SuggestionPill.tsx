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
      className="inline-flex items-center gap-2 px-3 py-1 rounded-2xl border bg-background hover:shadow transition-shadow"
      title={(s.why || []).join(' • ')}
      onClick={async () => {
        await applyCategory(txn.id, s.category_slug);
        onApplied(txn.id);
      }}
    >
      <span className="font-medium">{s.label}</span>
      <span className="text-xs opacity-70">{Math.round(s.score * 100)}%</span>
    </button>
  );
}
