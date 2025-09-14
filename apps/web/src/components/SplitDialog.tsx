import React from "react";
import { getTxn, splitTxn } from "@/lib/api";

type Part = { amount: string; category?: string; note?: string };

export default function SplitDialog({ open, onOpenChange, txnId, onDone }:{ open:boolean; onOpenChange:(v:boolean)=>void; txnId:number; onDone:()=>void }){
  const [orig, setOrig] = React.useState<number>(0);
  const [parts, setParts] = React.useState<Part[]>([{ amount: "" }]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      try { const t = await getTxn(txnId); if (!alive) return; setOrig(Number(t?.amount || 0)); }
      catch {}
    })();
    return () => { alive = false; };
  }, [open, txnId]);

  function addPart() { setParts((p) => [...p, { amount: "" }]); }
  function removePart(i: number) { setParts((p) => p.filter((_, idx) => idx !== i)); }

  function total(): number { return parts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0); }

  async function onSave() {
    setError(null);
    const t = total();
    if (!Number.isFinite(t)) { setError("Invalid amounts"); return; }
    // strict within 0.01 tolerance
    if (Math.abs(t - orig) > 0.01) { setError("Parts must sum to the original amount"); return; }
    setSaving(true);
    try {
      await splitTxn(txnId, parts.map(p => ({ amount: p.amount, category: p.category || undefined, note: p.note || undefined })));
      onDone();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally { setSaving(false); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={()=>onOpenChange(false)} />
      <div className="relative z-10 bg-background border border-border rounded-xl m-auto p-4 w-[520px]">
        <div className="text-base font-semibold mb-2">Split transaction #{txnId}</div>
        <div className="text-xs opacity-70 mb-2">Original amount: {orig.toLocaleString(undefined, { style:'currency', currency:'USD' })}</div>
        {error && <div className="text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded p-2 mb-2">{error}</div>}
        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="grid grid-cols-6 gap-2 items-center">
              <input placeholder="Amount" className="col-span-2 bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
                type="number" step="0.01" value={p.amount} onChange={(e)=>setParts(ps=>ps.map((pp,idx)=> idx===i?{...pp, amount:e.target.value}:pp))} />
              <input placeholder="Category" className="col-span-2 bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
                value={p.category || ''} onChange={(e)=>setParts(ps=>ps.map((pp,idx)=> idx===i?{...pp, category:e.target.value}:pp))} />
              <input placeholder="Note" className="col-span-2 bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
                value={p.note || ''} onChange={(e)=>setParts(ps=>ps.map((pp,idx)=> idx===i?{...pp, note:e.target.value}:pp))} />
              <div className="col-span-6 text-right">
                <button className="text-xs opacity-80 hover:opacity-100" onClick={()=>removePart(i)} disabled={parts.length<=1}>Remove</button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm opacity-80">
            <button className="underline" onClick={addPart}>Add part</button>
            <div>Total: {total().toLocaleString(undefined, { style:'currency', currency:'USD' })}</div>
          </div>
        </div>
        <div className="mt-3 flex gap-2 justify-end">
          <button className="text-sm" onClick={()=>onOpenChange(false)} disabled={saving}>Cancel</button>
          <button className="text-sm px-3 py-1.5 rounded bg-blue-600 disabled:opacity-50" onClick={onSave} disabled={saving}>Save</button>
        </div>
      </div>
    </div>
  );
}
