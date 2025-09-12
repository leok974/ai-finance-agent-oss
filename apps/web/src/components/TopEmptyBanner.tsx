import React from "react";
import DbRevBadge from "./DbRevBadge";

interface Props {
  onDismiss?: () => void;
  dbRev?: string;
  inSync?: boolean;
}

const TopEmptyBanner: React.FC<Props> = ({ onDismiss, dbRev, inSync }) => {
  return (
    <div className="mb-3 rounded-xl border border-amber-700 bg-amber-900/30 p-3 text-amber-100">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm">
          <div className="font-semibold">No transactions yet</div>
          <div className="opacity-90">
            Upload a CSV to begin. Use the <span className="font-medium">Upload CSV</span> card.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dbRev && <DbRevBadge dbRevision={dbRev} inSync={inSync} />}
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
    </div>
  );
};

export default TopEmptyBanner;
