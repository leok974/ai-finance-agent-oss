import React, { useState } from "react";
import Card from "./Card";
import { useRuleSuggestions } from "@/hooks/useRuleSuggestions";

function fmtPct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

export default function RuleSuggestionsPersistentPanel() {
  const { items, loading, error, query, setFilter, accept, dismiss } = useRuleSuggestions({ limit: 50 });
  const [merchantFilter, setMerchantFilter] = useState(query.merchant_norm ?? "");
  const [categoryFilter, setCategoryFilter] = useState(query.category ?? "");

  return (
    <Card>
      <header className="flex items-center gap-3 pb-1 mb-3 border-b border-border">
        <h3 className="text-base font-semibold">Rule Suggestions (persistent)</h3>
        <div className="ml-auto flex items-end gap-2">
          <div>
            <label className="block text-xs opacity-70">Merchant</label>
            <input
              value={merchantFilter}
              onChange={(e) => setMerchantFilter(e.target.value)}
              placeholder="normalized merchant"
              className="bg-transparent border border-border rounded px-2 py-1 min-w-[160px]"
            />
          </div>
          <div>
            <label className="block text-xs opacity-70">Category</label>
            <input
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              placeholder="category"
              className="bg-transparent border border-border rounded px-2 py-1 min-w-[140px]"
            />
          </div>
          <button
            className="btn btn-sm"
            onClick={() => setFilter({ merchant_norm: merchantFilter || undefined, category: categoryFilter || undefined })}
          >
            Apply
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setMerchantFilter(""); setCategoryFilter(""); setFilter({ merchant_norm: undefined, category: undefined }); }}
          >
            Reset
          </button>
        </div>
      </header>

      {loading && <div className="text-sm opacity-70">Loading…</div>}
      {error && <div className="text-sm text-red-500">{error}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full border border-border rounded-lg overflow-hidden">
          <thead className="bg-muted/30 text-left">
            <tr>
              <th className="px-3 py-2 border-b">Merchant</th>
              <th className="px-3 py-2 border-b">Category</th>
              <th className="px-3 py-2 border-b">Support</th>
              <th className="px-3 py-2 border-b">Positive</th>
              <th className="px-3 py-2 border-b">Last Seen</th>
              <th className="px-3 py-2 border-b"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center opacity-70">No suggestions yet.</td>
              </tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 border-b align-top">{s.merchant_norm}</td>
                  <td className="px-3 py-2 border-b align-top">{s.category}</td>
                  <td className="px-3 py-2 border-b align-top">{s.support}</td>
                  <td className="px-3 py-2 border-b align-top">{fmtPct(s.positive_rate)}</td>
                  <td className="px-3 py-2 border-b align-top">{s.last_seen ? new Date(s.last_seen).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2 border-b align-top">
                    <div className="flex gap-2">
                      <button className="btn btn-sm" onClick={async () => { await accept(s.id); }}>Accept → Rule</button>
                      <button className="btn btn-ghost btn-sm" onClick={async () => { await dismiss(s.id); }}>Dismiss</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
