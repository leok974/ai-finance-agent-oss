import React from "react";
import { bulkPatchTxns } from "@/lib/api";

export default function BulkEditDialog({ open, onOpenChange, ids, onSaved }:{ open:boolean; onOpenChange:(v:boolean)=>void; ids:number[]; onSaved:(updated:number)=>void }){
  const [form, setForm] = React.useState<{ category?: string; note?: string }>(() => ({ category: "", note: "" }));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSave() {
    setSaving(true); setError(null);
    try {
      const patch: any = {};
      if (form.category) patch.category = form.category;
      if (form.note) patch.note = form.note;
      const res = await bulkPatchTxns(ids, patch);
      const n = Number((res as any)?.updated ?? ids.length);
      onSaved(n);
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
        <div className="text-base font-semibold mb-2">Bulk edit ({ids.length})</div>
        {error && <div className="text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded p-2 mb-2">{error}</div>}
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="block opacity-70 mb-1">Category</span>
            <input className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1" value={form.category ?? ''} onChange={(e)=>setForm(f=>({...f, category:e.target.value}))} placeholder="Leave blank to keep" />
          </label>
          <label className="block text-sm">
            <span className="block opacity-70 mb-1">Note</span>
            <input className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1" value={form.note ?? ''} onChange={(e)=>setForm(f=>({...f, note:e.target.value}))} placeholder="Leave blank to keep" />
          </label>
        </div>
        <div className="mt-3 flex gap-2 justify-end">
          <button className="text-sm" onClick={()=>onOpenChange(false)} disabled={saving}>Cancel</button>
          <button className="text-sm px-3 py-1.5 rounded bg-blue-600 disabled:opacity-50" onClick={onSave} disabled={saving || ids.length===0}>Save</button>
        </div>
      </div>
    </div>
  );
}
