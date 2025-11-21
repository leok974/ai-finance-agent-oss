import * as React from 'react';

export interface SearchTransactionItem {
  id: number;
  booked_at: string;
  merchant_canonical: string;
  amount: number;
  category_slug?: string | null;
}

interface Props {
  items: SearchTransactionItem[];
}

export const SearchTransactionsInlineTable: React.FC<Props> = ({ items }) => {
  if (!items.length) return null;

  return (
    <div
      className="mt-3 rounded-2xl bg-slate-900/70 px-3 py-2 text-xs backdrop-blur"
      data-testid="lm-chat-tool-search-results"
    >
      <div className="mb-1 text-[0.7rem] uppercase tracking-wide text-slate-400">
        Top matches
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.7rem]">
          <thead className="text-slate-400">
            <tr>
              <th className="pb-1 pr-2 text-left font-medium">Date</th>
              <th className="pb-1 pr-2 text-left font-medium">Merchant</th>
              <th className="pb-1 pr-2 text-right font-medium">Amount</th>
              <th className="pb-1 text-left font-medium">Category</th>
            </tr>
          </thead>
          <tbody data-testid="lm-chat-tool-search-results-body">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="py-0.5 pr-2 text-slate-200">
                  {item.booked_at}
                </td>
                <td className="py-0.5 pr-2 text-slate-100">
                  {item.merchant_canonical}
                </td>
                <td className="py-0.5 pr-2 text-right text-slate-100">
                  ${Math.abs(item.amount).toFixed(2)}
                </td>
                <td className="py-0.5 text-slate-300">
                  {item.category_slug ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length >= 5 && (
        <div className="mt-1 text-[0.65rem] text-slate-500">
          Showing top {items.length} results.
        </div>
      )}
    </div>
  );
};
