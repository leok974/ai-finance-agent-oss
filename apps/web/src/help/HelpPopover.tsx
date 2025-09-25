import React from "react";
import type { HelpEntry, HelpKey } from "./helpRegistry";
import { telemetry } from "@/lib/api";

export default function HelpPopover(props: { rect: DOMRect; entry: HelpEntry; onClose: () => void; entryKey?: HelpKey }) {
  const { rect, entry, onClose, entryKey } = props;
  const top = Math.max(16, rect.top - 12 - 120);
  const left = Math.min(window.innerWidth - 380, Math.max(16, rect.left));
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    closeRef.current?.focus();
    // Telemetry: log help open (route + key)
    telemetry.helpOpen({ key: String(entryKey ?? entry.title), path: location.pathname, ts: Date.now() }).catch(() => {});
  }, []);

  return (
    <div
      className="help-popover rounded-2xl shadow-lg p-4 bg-zinc-900/95 border border-zinc-700 fixed z-[70] max-w-[360px]"
      style={{ top, left }}
      role="dialog"
      aria-modal="true"
      aria-label={entry.title}
    >
      <div className="font-semibold mb-1">{entry.title}</div>
      <div className="text-sm opacity-90">{entry.body}</div>
      <button ref={closeRef} className="mt-3 text-xs opacity-80 hover:opacity-100 underline" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
