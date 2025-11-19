/**
 * TransactionRowWithSuggestions - Enhanced transaction row with ML suggestions
 */
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CategoryCell } from './CategoryCell';
import { SuggestionList } from './SuggestionChip';
import type { SuggestItem } from '@/lib/api';
import { sendSuggestionFeedback } from '@/lib/api';
import { createCategorizeRule } from '@/api/rules';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
  pending?: boolean;
};

type TransactionRowWithSuggestionsProps = {
  transaction: Transaction;
  suggestion?: SuggestItem;
  allCategories: string[];
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
  allCategories,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onAcceptSuggestion,
  onRejectSuggestion,
  suggestionsLoading = false,
}: TransactionRowWithSuggestionsProps) {
  const [applying, setApplying] = useState(false);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [previousCategory, setPreviousCategory] = useState<string | null>(null);
  const showSuggestions = !transaction.category && suggestion?.candidates && suggestion.candidates.length > 0;

  // Load last event ID from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`lm:lastEvent:${transaction.id}`);
      if (stored) {
        setLastEventId(stored);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, [transaction.id]);

  const handleAccept = async (candidate: { label: string }) => {
    setApplying(true);
    try {
      // Store previous category for potential undo
      setPreviousCategory(transaction.category || null);

      // Send accept feedback if we have an event_id
      if (suggestion?.event_id) {
        await sendSuggestionFeedback(suggestion.event_id, 'accept', 'user accepted');
        setLastEventId(suggestion.event_id);
        try {
          localStorage.setItem(`lm:lastEvent:${transaction.id}`, suggestion.event_id);
        } catch {
          // Ignore localStorage errors
        }
      }

      // Update transaction category
      await onAcceptSuggestion(transaction.id, candidate.label);
      toast.success('Category updated');
    } catch (error) {
      toast.error('Failed to apply suggestion');
      console.error('Accept suggestion error:', error);
    } finally {
      setApplying(false);
    }
  };

  const handleReject = (candidate: { label: string }) => {
    if (suggestion?.event_id) {
      sendSuggestionFeedback(suggestion.event_id, 'reject', 'user rejected').catch(console.error);
    }
    onRejectSuggestion(transaction.id, candidate.label);
    toast('Suggestion dismissed');
  };

  const handleUndo = async () => {
    const eventId = lastEventId || (typeof window !== 'undefined' ? localStorage.getItem(`lm:lastEvent:${transaction.id}`) : null);
    if (!eventId) return;

    setApplying(true);
    try {
      await sendSuggestionFeedback(eventId, 'undo', 'user undo');

      // Restore previous category if available
      if (previousCategory !== null) {
        await onAcceptSuggestion(transaction.id, previousCategory);
      }

      // Clear stored event
      setLastEventId(null);
      try {
        localStorage.removeItem(`lm:lastEvent:${transaction.id}`);
      } catch {
        // Ignore localStorage errors
      }

      toast.success('Reverted last change');
    } catch (error) {
      toast.error('Failed to undo');
      console.error('Undo error:', error);
    } finally {
      setApplying(false);
    }
  };

  const canUndo = !!(lastEventId || (typeof window !== 'undefined' && localStorage.getItem(`lm:lastEvent:${transaction.id}`)));

  // Convert ML suggestions to CategoryCell format
  const categoryCandidates = suggestion?.candidates?.map((c) => ({
    label: c.label,
    confidence: c.confidence,
  })) ?? [];

  // Handle category save from inline picker
  const handleCategorySave = async ({ category, makeRule }: { category: string; makeRule: boolean }) => {
    // Update transaction category
    await onAcceptSuggestion(transaction.id, category);

    // Create rule if requested
    if (makeRule && transaction.merchant) {
      try {
        await createCategorizeRule({
          merchant: transaction.merchant_canonical || transaction.merchant,
          category,
        });
        toast.success('Rule created for similar transactions');
      } catch (error) {
        console.error('Failed to create rule:', error);
        toast.error('Failed to create rule');
      }
    }

    // Send feedback if we have an event_id
    if (suggestion?.event_id) {
      await sendSuggestionFeedback(suggestion.event_id, 'accept', 'user accepted');
      setLastEventId(suggestion.event_id);
      try {
        localStorage.setItem(`lm:lastEvent:${transaction.id}`, suggestion.event_id);
      } catch {
        // Ignore localStorage errors
      }
    }
  };

  return (
    <>
      <tr
        className={`transaction-row ${
          isSelected ? 'bg-primary/5' : ''
        } ${transaction.deleted_at ? 'opacity-50' : ''}`}
        data-testid={`transaction-row-${transaction.id}`}
      >
        <td className="px-2 py-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect(transaction.id, e.target.checked)}
          />
        </td>
        <td className="px-2 py-1 whitespace-nowrap">
          <div className="flex items-center gap-2">
            {transaction.date || '—'}
            {transaction.pending && (
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-400/40">
                Pending
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-1">
          {transaction.merchant_canonical || transaction.merchant || '—'}
        </td>
        <td className="px-2 py-1">
          <CategoryCell
            txnId={transaction.id}
            merchant={transaction.merchant}
            category={transaction.category}
            suggestions={categoryCandidates}
            allCategories={allCategories}
            onSave={handleCategorySave}
            disabled={!!transaction.deleted_at || applying}
          />
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
                  onReject={handleReject}
                  maxVisible={3}
                />
                {canUndo && (
                  <button
                    onClick={handleUndo}
                    disabled={applying}
                    className="text-xs underline opacity-80 hover:opacity-100 text-blue-600 ml-2 disabled:opacity-50"
                    title="Undo last suggestion acceptance"
                  >
                    Undo last apply
                  </button>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
