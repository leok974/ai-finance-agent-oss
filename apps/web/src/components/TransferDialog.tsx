import React from "react";
import { linkTransfer } from "@/lib/api";

export default function TransferDialog({ open, onOpenChange, ids, onDone }:{ open:boolean; onOpenChange:(v:boolean)=>void; ids:[number,number]; onDone:(group?:string)=>void }){
  const [group, setGroup] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onLink() {
    setSaving(true); setError(null);
    try {
      const res = await linkTransfer(ids[0], ids[1], group || undefined);
      const g = (res as any)?.group;
      onDone(typeof g === 'string' ? g : undefined);
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
        <div className="text-base font-semibold mb-2">Link transfer</div>
        <div className="text-xs opacity-70 mb-2">Select exactly two rows (outflow & inflow). Linking will group them as a transfer.</div>
        {error && <div className="text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded p-2 mb-2">{error}</div>}
        <label className="block text-sm">
          <span className="block opacity-70 mb-1">Group (optional)</span>
          <input className="w-full bg-neutral-900 border border-neutral-800 rounded px-2 py-1" value={group} onChange={(e)=>setGroup(e.target.value)} placeholder="Leave blank to auto-generate" />
        </label>
        <div className="mt-3 flex gap-2 justify-end">
          <button className="text-sm" onClick={()=>onOpenChange(false)} disabled={saving}>Cancel</button>
          <button className="text-sm px-3 py-1.5 rounded bg-blue-600 disabled:opacity-50" onClick={onLink} disabled={saving || ids.length!==2}>Link</button>
        </div>
      </div>
    </div>
  );
}
