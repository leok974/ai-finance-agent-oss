import React from "react";
import { listTxns, getTxn, patchTxn, bulkPatchTxns, deleteTxn, restoreTxn, splitTxn, mergeTxns, linkTransfer } from "@/lib/api";
import { Button } from "@/components/ui/button";
import Card from "@/components/Card";
import { emitToastSuccess, emitToastError } from "@/lib/toast-helpers";
import TxnEditDialog from "./TxnEditDialog";
import SplitDialog from "./SplitDialog";
import MergeDialog from "./MergeDialog";
import TransferDialog from "./TransferDialog";
import BulkEditDialog from "./bulk/BulkEditDialog";

type Row = {
  id: number;
  date?: string | null;
  merchant?: string | null;
  merchant_canonical?: string | null;
  description?: string | null;
  category?: string | null;
  amount: number;
  deleted_at?: string | null;
  split_parent_id?: number | null;
  transfer_group?: string | null;
};

export default function TransactionsPanel() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [total, setTotal] = React.useState(0);
  const [sel, setSel] = React.useState<number[]>([]);
  const [q, setQ] = React.useState("");
  const [month, setMonth] = React.useState<string | undefined>(undefined);
  const [sort, setSort] = React.useState("-date");
  const [page, setPage] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const limit = 50;
  // Removed legacy toast hook in favor of emit helpers

  // Dialog state
  const [editId, setEditId] = React.useState<number | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState<boolean>(false);
  const [splitId, setSplitId] = React.useState<number | null>(null);
  const [mergeOpen, setMergeOpen] = React.useState<boolean>(false);
  const [transferIds, setTransferIds] = React.useState<[number, number] | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTxns({ q, month, limit, offset: page * limit, sort });
      const items: Row[] = (res as any)?.items || [];
      setRows(items);
      setTotal(Number((res as any)?.total || items.length || 0));
      setSel([]);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [q, month, sort, page]);

  React.useEffect(() => { refresh(); }, [refresh]);

  // Keyboard shortcuts for selection actions
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return; // ignore typing in inputs
      const k = e.key.toLowerCase();
      if (k === 'e' && sel.length === 1) { e.preventDefault(); openEdit(sel[0]); }
      if (k === 'd' && sel.length >= 1) { e.preventDefault(); handleDelete(sel); }
      if (k === 's' && sel.length === 1) { e.preventDefault(); openSplit(sel[0]); }
      if (k === 'm' && sel.length >= 2) { e.preventDefault(); openMerge(sel); }
      if (k === 't' && sel.length === 2) { e.preventDefault(); openTransfer(sel); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel]);

  async function handleDelete(ids: number[]) {
    try {
      await Promise.all(ids.map((id) => deleteTxn(id)));
  emitToastSuccess("Deleted", { description: `${ids.length} transaction(s) soft-deleted.` });
      refresh();
    } catch (e: any) {
  emitToastError("Delete failed", { description: e?.message || String(e) });
    }
  }

  // Dialog openers
  function openEdit(idOrRow: number | Row) {
    const id = typeof idOrRow === 'number' ? idOrRow : idOrRow.id;
    setEditId(id);
  }
  function openBulkEdit(ids: number[]) {
    if (!ids.length) return;
    setBulkOpen(true);
  }
  function openSplit(idOrRow: number | Row) {
    const id = typeof idOrRow === 'number' ? idOrRow : idOrRow.id;
    setSplitId(id);
  }
  function openMerge(ids: number[]) {
    if (ids.length < 2) return;
    setMergeOpen(true);
  }
  function openTransfer(ids: number[]) {
    if (ids.length !== 2) return;
    setTransferIds([ids[0], ids[1]]);
  }

  const toggleAll = (checked: boolean) => setSel(checked ? rows.map((r) => r.id) : []);
  const toggleOne = (id: number, checked: boolean) => setSel((cur) => (checked ? [...new Set([...cur, id])] : cur.filter((x) => x !== id)));

  const start = page * limit + 1;
  const end = Math.min(total, (page + 1) * limit);

  return (
    <Card className="p-3" title={undefined as any}>
      <div className="flex items-center gap-2 mb-2">
        <input className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="-date">Newest</option>
          <option value="date">Oldest</option>
          <option value="-amount">Amount ↓</option>
          <option value="amount">Amount ↑</option>
        </select>
        <div className="ml-auto text-sm opacity-70">{sel.length} selected</div>
      </div>

      {loading && <div className="text-sm opacity-70">Loading…</div>}
      {error && <div className="text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2 mb-2">{error}</div>}
      {!loading && rows.length === 0 && <div className="text-sm opacity-70">No transactions.</div>}

      {rows.length > 0 && (
        <div className="overflow-auto border border-border rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-2 py-1"><input type="checkbox" aria-label="Select all" checked={sel.length === rows.length && rows.length > 0} onChange={(e) => toggleAll(e.target.checked)} /></th>
                <th className="px-2 py-1">Date</th>
                <th className="px-2 py-1">Merchant</th>
                <th className="px-2 py-1">Category</th>
                <th className="px-2 py-1 text-right">Amount</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-2 py-1"><input type="checkbox" checked={sel.includes(r.id)} onChange={(e) => toggleOne(r.id, e.target.checked)} /></td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.date || '—'}</td>
                  <td className="px-2 py-1">{(r as any).merchant_canonical || r.merchant || '—'}</td>
                  <td className="px-2 py-1">{r.category || <span className="opacity-60">—</span>}</td>
                  <td className="px-2 py-1 text-right">{r.amount?.toLocaleString?.(undefined, { style: 'currency', currency: 'USD' }) ?? String(r.amount)}</td>
                  <td className="px-2 py-1 text-right">
                    <Button variant="pill-ghost" onClick={() => openEdit(r)}>Edit</Button>
                    <Button variant="pill-danger" onClick={() => handleDelete([r.id])}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex gap-2 items-center">
        <Button onClick={() => openBulkEdit(sel)} disabled={sel.length === 0}>Bulk Edit</Button>
        <Button onClick={() => openSplit(sel[0])} disabled={sel.length !== 1}>Split</Button>
        <Button onClick={() => openMerge(sel)} disabled={sel.length < 2}>Merge</Button>
        <Button onClick={() => openTransfer(sel)} disabled={sel.length !== 2}>Link Transfer</Button>
  <Button variant="pill-success" onClick={async () => { await Promise.all(sel.map((id) => restoreTxn(id))); emitToastSuccess("Restored", { description: `${sel.length} transaction(s) restored.` }); refresh(); }}>Restore</Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="pill-outline" onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
          <span className="mx-2 text-sm">{start}–{end} / {total}</span>
          <Button variant="pill-outline" onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * limit >= total}>Next</Button>
        </div>
      </div>

      {/* Dialogs */}
      {editId != null && (
        <TxnEditDialog
          open={true}
          onOpenChange={(v) => { if (!v) setEditId(null); }}
          txnId={editId}
          onSaved={() => { emitToastSuccess("Updated", { description: `Transaction #${editId} updated.` }); refresh(); }}
        />
      )}
      {bulkOpen && (
        <BulkEditDialog
          open={true}
          onOpenChange={(v) => { if (!v) setBulkOpen(false); }}
          ids={sel}
          onSaved={(n) => { emitToastSuccess("Bulk updated", { description: `${n} transaction(s) updated.` }); refresh(); }}
        />
      )}
      {splitId != null && (
        <SplitDialog
          open={true}
          onOpenChange={(v) => { if (!v) setSplitId(null); }}
          txnId={splitId}
          onDone={() => { emitToastSuccess("Split created", { description: `Transaction #${splitId} split.` }); refresh(); }}
        />
      )}
      {mergeOpen && (
        <MergeDialog
          open={true}
          onOpenChange={(v) => { if (!v) setMergeOpen(false); }}
          ids={sel}
          onDone={(mergedId) => { emitToastSuccess("Merged", { description: mergedId ? `Merged into #${mergedId}` : `Merged ${sel.length} transactions.` }); refresh(); }}
        />
      )}
      {transferIds && (
        <TransferDialog
          open={true}
          onOpenChange={(v) => { if (!v) setTransferIds(null); }}
          ids={transferIds}
          onDone={(group) => { emitToastSuccess("Linked", { description: `Transfer group ${group || 'created'}.` }); refresh(); }}
        />
      )}
    </Card>
  );
}
