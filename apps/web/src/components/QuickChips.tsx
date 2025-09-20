import React from "react";

export type ChipAction =
  | { type: "nl_search"; query: string }
  | { type: "nl_search_filters"; filters: any }
  | { type: "toggle"; key: "insightsExpanded" }
  | { type: "nav"; href: string };

export type QuickChipItem = { label: string; action: ChipAction };

export function QuickChips({ items }: { items: QuickChipItem[] }) {
  if (!items?.length) return null;

  const handleClick = React.useCallback((action: ChipAction) => {
    const ev = new CustomEvent("chip-action", { detail: action });
    window.dispatchEvent(ev);
  }, []);

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          onClick={() => handleClick(it.action)}
          className="rounded-full border border-border bg-transparent px-3 py-1 text-xs transition-colors hover:bg-muted"
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
