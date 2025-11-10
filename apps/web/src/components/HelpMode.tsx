import * as React from "react";
import { createPortal } from "react-dom";
import { useExplain } from "@/hooks/useExplain";
import HelpLayer from "@/features/help/HelpLayer";

export default function HelpMode() {
  const [on, setOn] = React.useState(false);
  const explainApi = useExplain();
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const prevFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "?") setOn(v => !v); };
    const toggle = () => setOn(v => !v);
    window.addEventListener("keydown", keyHandler);
    window.addEventListener("help-mode:toggle", toggle as any);
    return () => {
      window.removeEventListener("keydown", keyHandler);
      window.removeEventListener("help-mode:toggle", toggle as any);
    };
  }, []);

  React.useEffect(() => {
    if (on) {
      // remember current focus and move focus into the dialog once mounted
      prevFocusRef.current = (document.activeElement as HTMLElement) || null;
    } else {
      // restore focus on close
      prevFocusRef.current?.focus?.();
    }
  }, [on]);

  // Click handling is now provided by AppHelpMode/useHelpMode.

  React.useEffect(() => {
    if (on) {
      // move focus inside the help overlay
      setTimeout(() => dialogRef.current?.focus?.(), 0);
    }
  }, [on]);

  if (!on) return null;
  
  // ⛑️ Safety: ensure DOM is ready before creating portal
  if (typeof window === 'undefined' || !document.body) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] pointer-events-none" aria-hidden={false}>
      <HelpLayer active={on} />
      <div
        ref={dialogRef}
        className="pointer-events-auto fixed bottom-4 right-4 rounded-xl border bg-background p-3 shadow-xl z-[9600]"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <div className="font-medium mb-1">Help mode</div>
        <div className="text-sm text-muted-foreground">Click any highlighted card to see its explanation.</div>
        <div className="mt-2 text-xs">Press <kbd>?</kbd> to exit.</div>
      </div>
    </div>,
    document.body
  );
}
