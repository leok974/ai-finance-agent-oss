import React from "react";
import { mergeTxns, getTxn } from "@/lib/api";

export default function MergeDialog({ open, onOpenChange, ids, onDone }:{ open:boolean; onOpenChange:(v:boolean)=>void; ids:number[]; onDone:(mergedId?:number)=>void }){
  const [note, setNote] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [signOk, setSignOk] = React.useState<boolean>(true);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try {
        const amounts: number[] = [];
        for (const id of ids) {
          const t = await getTxn(id);
          amounts.push(Number(t?.amount || 0));
        }
        if (!alive) return;
        const signs = amounts.map(a => (a === 0 ? 0 : (a > 0 ? 1 : -1)));
        const allSame = signs.every(s => s === signs[0]);
        setSignOk(allSame);
      } catch {
        setSignOk(true); // fallback to allow
      }
    })();
    return () => { alive = false; };
  }, [open, ids]);

  async function onMerge() {
    setSaving(true); setError(null);
    try {
      const res = await mergeTxns(ids, note || undefined);
      const id = (res as any)?.id;
      onDone(typeof id === 'number' ? id : undefined);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally { setSaving(false); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={()=>onOpenChange(false)} />
      <div className="relative z-10 bg-background border border-border rounded-xl m-auto p-4 w-[460px]">
        <div className="text-base font-semibold mb-2">Merge {ids.length} transactions</div>
        {error && <div className="text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded p-2 mb-2">{error}</div>}
        <label className="block text-sm">
          <span className="block opacity-70 mb-1">Merged note (optional)</span>
          <input className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1" value={note} onChange={(e)=>setNote(e.target.value)} />
        </label>
        <div className="mt-3 flex gap-2 justify-end">
          <button className="text-sm" onClick={()=>onOpenChange(false)} disabled={saving}>Cancel</button>
          <button className="text-sm px-3 py-1.5 rounded bg-blue-600 disabled:opacity-50" onClick={onMerge} disabled={saving || ids.length<2 || !signOk}>Merge</button>
        </div>
        {!signOk && <div className="mt-2 text-xs text-amber-300/90">Select transactions with the same sign (don’t merge income with expense).</div>}
      </div>
    </div>
  );
}
