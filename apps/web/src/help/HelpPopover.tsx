import React from "react";
import type { HelpEntry } from "./helpRegistry";

export default function HelpPopover(props: { rect: DOMRect; entry: HelpEntry; onClose: () => void }) {
  const { rect, entry, onClose } = props;
  const top = Math.max(16, rect.top - 12 - 120);
  const left = Math.min(window.innerWidth - 380, Math.max(16, rect.left));

  return (
    <div
      className="help-popover rounded-2xl shadow-lg p-4 bg-zinc-900/95 border border-zinc-700 fixed z-[70] max-w-[360px]"
      style={{ top, left }}
    >
      <div className="font-semibold mb-1">{entry.title}</div>
      <div className="text-sm opacity-90">{entry.body}</div>
      <button className="mt-3 text-xs opacity-80 hover:opacity-100 underline" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
