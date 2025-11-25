/**
 * TransactionRowWithSuggestions - Enhanced transaction row with ML suggestions
 * Uses canonical API helpers (categorizeTxn, mlFeedback) aligned with UnknownsPanel
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CategoryCell } from './CategoryCell';
import { SuggestionList } from './SuggestionChip';
import { categorizeTxn, mlFeedback } from '@/lib/api';
import { createCategorizeRule } from '@/api/rules';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ExplainSuggestionButton } from './ExplainSuggestionButton';
import { SuggestionsInfoModal } from './SuggestionsInfoModal';
import { getSuggestionConfidencePercent } from '../lib/suggestions';

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

type CategorySuggestion = {
  label: string;
  confidence: number;
  reasons?: string[];
};

type TransactionRowWithSuggestionsProps = {
  transaction: Transaction;
  suggestions?: CategorySuggestion[];
  allCategories: string[];
  isSelected: boolean;
  onSelect: (id: number, checked: boolean) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onAcceptSuggestion: (id: number, category: string) => Promise<void>;
  onRejectSuggestion?: (id: number, category: string) => void;
  suggestionsLoading?: boolean;
};

export function TransactionRowWithSuggestions({
  transaction,
  suggestions = [],
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
  const [appliedCategory, setAppliedCategory] = useState<string | null>(null);

  // Only show suggestions for uncategorized transactions
  const isUncategorized = !transaction.category || transaction.category === 'uncategorized' || transaction.category === 'unknown';
  const showSuggestions = isUncategorized && suggestions.length > 0;

  // Handle accepting a suggestion (same flow as UnknownsPanel)
  const handleAccept = async (candidate: { label: string }) => {
    setApplying(true);
    try {
      // 1) Apply the category to the transaction
      await categorizeTxn(transaction.id, candidate.label);

      // 2) Fire-and-forget ML feedback for learning
      mlFeedback({
        txn_id: transaction.id,
        merchant: transaction.merchant_canonical || transaction.merchant || undefined,
        category: candidate.label,
        action: 'accept',
      }).catch((err) => {
        // Swallow errors - this is learning signal, not core UX
        const message = err instanceof Error ? err.message : String(err);
        const is404 = message.includes('404') || message.includes('Not Found');
        if (!is404) {
          console.warn('[TransactionRow] mlFeedback failed (non-critical):', message);
        }
      });

      // 3) Update local state
      setAppliedCategory(candidate.label);

      // 4) Notify parent to refresh the transaction
      await onAcceptSuggestion(transaction.id, candidate.label);

      // 5) Show success feedback with details
      const merchantDisplay = transaction.merchant || transaction.description || 'transaction';
      toast.success(`Applied "${candidate.label}"`, {
        description: `Updated category for ${merchantDisplay}`,
        duration: 4000,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to apply suggestion', {
        description: errorMsg,
        duration: 5000,
      });
      console.error('Accept suggestion error:', error);
    } finally {
      setApplying(false);
    }
  };

  const handleReject = (candidate: { label: string }) => {
    // Optional: notify parent if rejection tracking needed
    onRejectSuggestion?.(transaction.id, candidate.label);
    toast.info('Suggestion dismissed', {
      description: `Won't suggest "${candidate.label}" for similar transactions`,
      duration: 3000,
    });
  };

  // Convert suggestions to CategoryCell format
  const categoryCandidates = suggestions.map((s) => ({
    label: s.label,
    confidence: s.confidence,
    reasons: s.reasons || [],
  }));

  // Handle category save from inline picker
  const handleCategorySave = async ({ category, makeRule }: { category: string; makeRule: boolean }) => {
    setApplying(true);
    try {
      // Update transaction category
      await categorizeTxn(transaction.id, category);

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

      // Send ML feedback for learning
      mlFeedback({
        txn_id: transaction.id,
        merchant: transaction.merchant_canonical || transaction.merchant || undefined,
        category,
        action: 'accept',
      }).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        const is404 = message.includes('404') || message.includes('Not Found');
        if (!is404) {
          console.warn('[TransactionRow] mlFeedback failed (non-critical):', message);
        }
      });

      setAppliedCategory(category);
      await onAcceptSuggestion(transaction.id, category);
      const ruleText = makeRule ? ' (+ rule created)' : '';
      toast.success(`Category updated to "${category}"${ruleText}`, {
        description: transaction.merchant || transaction.description || undefined,
        duration: 4000,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('Failed to save category:', error);
      toast.error('Failed to save category', {
        description: errorMsg,
        duration: 5000,
      });
    } finally {
      setApplying(false);
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
          <td colSpan={4} className="px-2 py-2 align-top">
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
              <div className="min-h-[40px] flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-200/90">
                    Suggested
                  </span>
                  {suggestions.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-100">
                      {getSuggestionConfidencePercent(suggestions[0])}% confident
                    </span>
                  )}
                  <SuggestionsInfoModal
                    source="transactions"
                    triggerClassName="text-[10px] text-slate-400 hover:text-slate-200 underline underline-offset-2"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <SuggestionList
                    candidates={categoryCandidates}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    maxVisible={3}
                  />

                  {/* Show explain button if we have a primary suggestion */}
                  {suggestions.length > 0 && (
                    <ExplainSuggestionButton
                      txnId={transaction.id}
                      categorySlug={suggestions[0].label}
                    />
                  )}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}

      {/* Show applied confirmation if category was just set */}
      {appliedCategory && !isUncategorized && (
        <tr className="bg-gradient-to-r from-green-50/50 to-transparent border-l-2 border-l-green-400">
          <td colSpan={2} className="px-2 py-2"></td>
          <td colSpan={4} className="px-2 py-2">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <span className="font-medium">✓ Applied:</span>
              <span>{appliedCategory}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
