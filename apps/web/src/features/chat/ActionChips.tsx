/**
 * Action chips for finance deep-dive follow-ups
 * Renders clickable buttons that trigger NL commands
 */

import React from "react";

export type ChipAction = {
  label: string;
  action: string;
  testId?: string;
};

type ActionChipsProps = {
  chips: ChipAction[];
  onAction: (action: string) => void;
  disabled?: boolean;
};

export function ActionChips({ chips, onAction, disabled }: ActionChipsProps) {
  if (!chips.length) return null;

  return (
    <div
      className="flex flex-wrap gap-2 mt-3"
      role="group"
      aria-label="Follow-up actions"
    >
      {chips.map((chip) => (
        <button
          key={chip.action}
          type="button"
          data-testid={chip.testId || `action-chip-${chip.action}`}
          disabled={disabled}
          onClick={() => onAction(chip.action)}
          className="text-xs px-3 py-1.5 rounded-full border border-neutral-600 bg-neutral-800 hover:bg-neutral-700 hover:border-neutral-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary/60"
          aria-label={chip.label}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
