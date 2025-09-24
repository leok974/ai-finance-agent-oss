import React from "react";
import { Button } from "@/components/ui/button";

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
        <Button
          key={it.label}
          type="button"
          onClick={() => handleClick(it.action)}
          variant="pill-outline"
        >
          {it.label}
        </Button>
      ))}
    </div>
  );
}
