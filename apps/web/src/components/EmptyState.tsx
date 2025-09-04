import React from "react";

const EmptyState: React.FC<{ title?: string; note?: string }> = ({ title, note }) => (
  <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/40 p-6 text-center">
    <div className="text-lg font-semibold text-gray-100">{title ?? "No data yet"}</div>
    <div className="mt-1 text-sm text-gray-400">
      Upload a CSV to begin. Use the <span className="font-medium text-gray-200">Upload CSV</span> card above.
    </div>
    {note && <div className="mt-2 text-xs text-gray-500">{note}</div>}
  </div>
);

export default EmptyState;
