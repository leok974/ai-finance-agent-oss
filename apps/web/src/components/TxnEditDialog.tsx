import React from "react";
import { getTxn, patchTxn } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function TxnEditDialog({ open, onOpenChange, txnId, onSaved }:{ open:boolean; onOpenChange:(v:boolean)=>void; txnId:number; onSaved:()=>void }){
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<{ date?: string; amount?: string; category?: string; note?: string; description?: string }>({});

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const t = await getTxn(txnId);
        if (!alive) return;
        setForm({
          date: t?.date ?? "",
          amount: t?.amount != null ? String(t.amount) : "",
          category: t?.category ?? "",
          note: t?.note ?? "",
          description: t?.description ?? "",
        });
      } catch (e: any) { if (alive) setError(e?.message || String(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [open, txnId]);

  async function onSave() {
    setLoading(true); setError(null);
    try {
      const patch: any = {};
      if (form.date) patch.date = form.date;
      if (form.amount != null && form.amount !== "") patch.amount = form.amount;
      if (form.category != null) patch.category = form.category;
      if (form.note != null) patch.note = form.note;
      if (form.description != null) patch.description = form.description;
      await patchTxn(txnId, patch);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally { setLoading(false); }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={()=>onOpenChange(false)} />
      <div className="relative z-10 bg-background border border-border rounded-xl m-auto p-4 w-[460px]">
        <div className="text-base font-semibold mb-2">Edit transaction #{txnId}</div>
        {error && <div className="text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded p-2 mb-2">{error}</div>}
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="block opacity-70 mb-1">Date</span>
            <input type="date" className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
              value={form.date || ''}
              onChange={(e)=>setForm(f=>({...f, date:e.target.value}))} />
          </label>
          <label className="block text-sm">
            <span className="block opacity-70 mb-1">Amount</span>
            <input type="number" step="0.01" className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
              value={form.amount ?? ''}
              onChange={(e)=>setForm(f=>({...f, amount:e.target.value}))} />
          </label>
          <label className="block text-sm">
            <span className="block opacity-70 mb-1">Category</span>
            <input className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
              value={form.category ?? ''}
              onChange={(e)=>setForm(f=>({...f, category:e.target.value}))} />
          </label>
          <label className="block text-sm">
            <span className="block opacity-70 mb-1">Note</span>
            <input className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
              value={form.note ?? ''}
              onChange={(e)=>setForm(f=>({...f, note:e.target.value}))} />
          </label>
          <label className="block text-sm">
            <span className="block opacity-70 mb-1">Description</span>
            <input className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
              value={form.description ?? ''}
              onChange={(e)=>setForm(f=>({...f, description:e.target.value}))} />
          </label>
        </div>
        <div className="mt-3 flex gap-2 justify-end">
          <Button variant="pill-outline" onClick={()=>onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant="pill-primary" className="h-9 px-4" onClick={onSave} disabled={loading}>Save</Button>
        </div>
      </div>
    </div>
  );
}
