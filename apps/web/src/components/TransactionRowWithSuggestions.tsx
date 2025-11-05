/**
 * TransactionRowWithSuggestions - Enhanced transaction row with ML suggestions
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SuggestionList } from './SuggestionChip';
import type { SuggestItem } from '@/lib/api';
import { Loader2 } from 'lucide-react';

type Transaction = {
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

type TransactionRowWithSuggestionsProps = {
  transaction: Transaction;
  suggestion?: SuggestItem;
  isSelected: boolean;
  onSelect: (id: number, checked: boolean) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onAcceptSuggestion: (id: number, category: string) => Promise<void>;
  onRejectSuggestion: (id: number, category: string) => void;
  suggestionsLoading?: boolean;
};

export function TransactionRowWithSuggestions({
  transaction,
  suggestion,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onAcceptSuggestion,
  onRejectSuggestion,
  suggestionsLoading = false,
}: TransactionRowWithSuggestionsProps) {
  const [applying, setApplying] = useState(false);
  const showSuggestions = !transaction.category && suggestion?.candidates && suggestion.candidates.length > 0;

  const handleAccept = async (candidate: { label: string }) => {
    setApplying(true);
    try {
      await onAcceptSuggestion(transaction.id, candidate.label);
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <tr
        className={`hover:bg-gray-50 ${
          isSelected ? 'bg-blue-50' : ''
        } ${transaction.deleted_at ? 'opacity-50' : ''}`}
      >
        <td className="px-2 py-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(transaction.id, e.target.checked)}
          />
        </td>
        <td className="px-2 py-1 whitespace-nowrap">
          {transaction.date || '—'}
        </td>
        <td className="px-2 py-1">
          {transaction.merchant_canonical || transaction.merchant || '—'}
        </td>
        <td className="px-2 py-1">
          {transaction.category || (
            <span className="opacity-60 italic">uncategorized</span>
          )}
        </td>
        <td className="px-2 py-1 text-right">
          {transaction.amount?.toLocaleString?.(undefined, {
            style: 'currency',
            currency: 'USD',
          }) ?? String(transaction.amount)}
        </td>
        <td className="px-2 py-1 text-right space-x-1">
          <Button
            variant="pill-ghost"
            size="sm"
            onClick={() => onEdit(transaction.id)}
          >
            Edit
          </Button>
          <Button
            variant="pill-danger"
            size="sm"
            onClick={() => onDelete(transaction.id)}
          >
            Delete
          </Button>
        </td>
      </tr>

      {/* Suggestions row - shows below transaction if uncategorized */}
      {showSuggestions && (
        <tr className="bg-gradient-to-r from-blue-50/50 to-transparent border-l-2 border-l-blue-300">
          <td colSpan={2} className="px-2 py-2"></td>
          <td colSpan={4} className="px-2 py-2">
            {applying ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Applying suggestion...</span>
              </div>
            ) : suggestionsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading suggestions...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-medium">
                  Suggested:
                </span>
                <SuggestionList
                  candidates={suggestion.candidates}
                  onAccept={handleAccept}
                  onReject={(candidate) => onRejectSuggestion(transaction.id, candidate.label)}
                  maxVisible={3}
                />
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
