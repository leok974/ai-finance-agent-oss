/**
 * SuggestionChip - Display ML-powered category suggestions
 */
import { Badge } from '@/components/ui/badge';
import { Sparkles, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SuggestionCandidate = {
  label: string;
  confidence: number;
  reasons: string[];
};

type SuggestionChipProps = {
  candidate: SuggestionCandidate;
  onAccept?: () => void;
  onReject?: () => void;
  disabled?: boolean;
  className?: string;
};

export function SuggestionChip({
  candidate,
  onAccept,
  onReject,
  disabled = false,
  className,
}: SuggestionChipProps) {
  const confidencePercent = Math.round(candidate.confidence * 100);
  const isHighConfidence = candidate.confidence >= 0.75;

  return (
    <div
      data-testid="suggestion-chip"
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
        isHighConfidence
          ? 'border-green-200 bg-green-50 text-green-700 hover:border-green-300'
          : 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300',
        disabled && 'opacity-50 cursor-not-allowed',
        !disabled && 'cursor-pointer hover:shadow-sm',
        className
      )}
      title={`${confidencePercent}% confidence - ${candidate.reasons.join(', ')}`}
    >
      <Sparkles className="h-3 w-3 opacity-70" />
      <span data-testid="suggestion-label" className="font-semibold">{candidate.label}</span>
      <span className="opacity-60 text-[10px]">{confidencePercent}%</span>

      {!disabled && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
          {onAccept && (
            <button
              data-testid="accept-suggestion-button"
              onClick={(e) => {
                e.stopPropagation();
                onAccept();
              }}
              className="p-0.5 rounded-full hover:bg-green-100 transition-colors"
              title="Accept suggestion"
              aria-label="Accept suggestion"
            >
              <CheckCircle2 className="h-3 w-3 text-green-600" />
            </button>
          )}
          {onReject && (
            <button
              data-testid="reject-suggestion-button"
              onClick={(e) => {
                e.stopPropagation();
                onReject();
              }}
              className="p-0.5 rounded-full hover:bg-red-100 transition-colors"
              title="Reject suggestion"
              aria-label="Reject suggestion"
            >
              <X className="h-3 w-3 text-red-600" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type SuggestionListProps = {
  candidates: SuggestionCandidate[];
  onAccept?: (candidate: SuggestionCandidate) => void;
  onReject?: (candidate: SuggestionCandidate) => void;
  maxVisible?: number;
  className?: string;
};

export function SuggestionList({
  candidates,
  onAccept,
  onReject,
  maxVisible = 3,
  className,
}: SuggestionListProps) {
  const visible = candidates.slice(0, maxVisible);

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {visible.map((candidate, idx) => (
        <SuggestionChip
          key={`${candidate.label}-${idx}`}
          candidate={candidate}
          onAccept={onAccept ? () => onAccept(candidate) : undefined}
          onReject={onReject ? () => onReject(candidate) : undefined}
        />
      ))}
    </div>
  );
}
