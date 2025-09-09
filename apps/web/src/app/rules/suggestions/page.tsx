"use client";

import { useRuleSuggestions } from "@/hooks/useRuleSuggestions";
import { useState } from "react";

function fmtPct(n: number) {
  return `${(n * 100).toFixed(0)}%`;
}

export default function SuggestionsPage() {
  const { items, loading, error, query, setFilter, accept, dismiss } = useRuleSuggestions();
  const [merchantFilter, setMerchantFilter] = useState(query.merchant_norm ?? "");
  const [categoryFilter, setCategoryFilter] = useState(query.category ?? "");

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Rule Suggestions</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm text-gray-500">Merchant (normalized)</label>
          <input
            value={merchantFilter}
            onChange={(e) => setMerchantFilter(e.target.value)}
            placeholder="e.g. starbucks 123"
            className="border rounded px-3 py-2 min-w-[240px]"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-500">Category</label>
          <input
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            placeholder="e.g. Coffee"
            className="border rounded px-3 py-2 min-w-[180px]"
          />
        </div>
        <button
          onClick={() => setFilter({ merchant_norm: merchantFilter || undefined, category: categoryFilter || undefined })}
          className="rounded-lg px-4 py-2 border shadow-sm hover:bg-gray-50"
        >
          Apply
        </button>
        <button
          onClick={() => { setMerchantFilter(""); setCategoryFilter(""); setFilter({ merchant_norm: undefined, category: undefined }); }}
          className="rounded-lg px-4 py-2 border shadow-sm hover:bg-gray-50"
        >
          Reset
        </button>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full border rounded-lg overflow-hidden">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2 border-b">Merchant</th>
              <th className="px-4 py-2 border-b">Category</th>
              <th className="px-4 py-2 border-b">Support</th>
              <th className="px-4 py-2 border-b">Positive</th>
              <th className="px-4 py-2 border-b">Last Seen</th>
              <th className="px-4 py-2 border-b"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  No suggestions yet.
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 border-b">{s.merchant_norm}</td>
                  <td className="px-4 py-2 border-b">{s.category}</td>
                  <td className="px-4 py-2 border-b">{s.support}</td>
                  <td className="px-4 py-2 border-b">{fmtPct(s.positive_rate)}</td>
                  <td className="px-4 py-2 border-b">{s.last_seen ? new Date(s.last_seen).toLocaleString() : "—"}</td>
                  <td className="px-4 py-2 border-b">
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-1 rounded-md border shadow-sm hover:bg-green-50"
                        onClick={async () => { await accept(s.id); }}
                      >
                        Accept → Rule
                      </button>
                      <button
                        className="px-3 py-1 rounded-md border shadow-sm hover:bg-gray-100"
                        onClick={async () => { await dismiss(s.id); }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
