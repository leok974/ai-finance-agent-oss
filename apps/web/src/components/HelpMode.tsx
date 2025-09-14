import * as React from "react";
import { createPortal } from "react-dom";
import { useExplain } from "@/hooks/useExplain";

export default function HelpMode() {
  const [on, setOn] = React.useState(false);
  const explainApi = useExplain();
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const prevFocusRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => { if (e.key === "?") setOn(v => !v); };
    const toggle = () => setOn(v => !v);
    const explainEvt = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
  const key = detail.key as string | undefined;
  const month = detail.month as string | undefined;
      if (!key) return;
  explainApi.explain(key, { month, withContext: true });
    };
    window.addEventListener("keydown", keyHandler);
    window.addEventListener("help-mode:toggle", toggle as any);
    window.addEventListener("help-mode:explain", explainEvt as any);
    return () => {
      window.removeEventListener("keydown", keyHandler);
      window.removeEventListener("help-mode:toggle", toggle as any);
      window.removeEventListener("help-mode:explain", explainEvt as any);
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

  React.useEffect(() => {
    if (!on) return;
    // Add halo classes
    const nodes = Array.from(document.querySelectorAll("[data-explain-key]")) as HTMLElement[];
    nodes.forEach((el) => el.classList.add("ring-2","ring-blue-400","rounded-lg","relative"));
    // Click-to-explain: delegate at document level
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      const el = t?.closest?.("[data-explain-key]") as HTMLElement | null;
      if (!el || !document.body.contains(el)) return;
      const key = el.getAttribute("data-explain-key") || "";
      const monthAttr = el.getAttribute("data-month") || undefined;
      window.dispatchEvent(new CustomEvent("help-mode:explain", { detail: { key, month: monthAttr } }));
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      // cleanup
      nodes.forEach((el) => el.classList.remove("ring-2","ring-blue-400","rounded-lg","relative"));
      document.removeEventListener("click", onClick, true);
    };
  }, [on]);

  React.useEffect(() => {
    if (on) {
      // move focus inside the help overlay
      setTimeout(() => dialogRef.current?.focus?.(), 0);
    }
  }, [on]);

  if (!on) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] pointer-events-none" aria-hidden={false}>
      <div className="absolute inset-0 bg-background/50 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        className="pointer-events-auto fixed bottom-4 right-4 rounded-xl border bg-background p-3 shadow-xl"
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
