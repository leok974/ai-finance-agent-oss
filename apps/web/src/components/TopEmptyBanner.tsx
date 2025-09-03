import React from "react";

interface Props {
  onDismiss?: () => void;
}

const TopEmptyBanner: React.FC<Props> = ({ onDismiss }) => {
  return (
    <div className="mb-3 rounded-xl border border-amber-700 bg-amber-900/30 p-3 text-amber-100">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm">
          <div className="font-semibold">No transactions yet</div>
          <div className="opacity-90">
            Upload a CSV to begin. Use the <span className="font-medium">Upload CSV</span> card.
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="rounded-lg border border-amber-600/50 px-2 py-1 text-xs hover:bg-amber-800/30"
            title="Hide"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
};

export default TopEmptyBanner;
