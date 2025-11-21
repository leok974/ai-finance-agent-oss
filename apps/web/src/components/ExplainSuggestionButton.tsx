import { useState } from 'react';
import { getExplain, type ExplainResponse } from '@/lib/api';

type Props = {
  txnId: number;
  categorySlug: string;
  className?: string;
};

export function ExplainSuggestionButton({ txnId, categorySlug, className }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setOpen(true);
    if (text || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getExplain(txnId);
      setText(res.reply || res.rationale || res.llm_rationale || 'No explanation available yet.');
    } catch (e) {
      const is404 = String(e).includes('404') || (e as any)?.status === 404;
      if (is404) {
        setText('Explanation feature not available yet.');
      } else {
        setError('Could not load explanation');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        className="text-xs underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity"
      >
        Why this category?
      </button>

      {open && (
        <div className="mt-1 max-w-sm rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-lg">
          {loading && <span className="text-slate-400">Loading explanation…</span>}
          {error && <span className="text-red-400">{error}</span>}
          {text && <p className="whitespace-pre-wrap text-slate-300">{text}</p>}
        </div>
      )}
    </div>
  );
}
