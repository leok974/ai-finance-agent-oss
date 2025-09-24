import * as React from "react";
import { createPortal } from "react-dom";
import { useExplain } from "@/hooks/useExplain";
import { Button, pillIconClass } from "@/components/ui/button";

/**
 * Tiny "?" badge to offer inline help.
 * - Click: open Explain popover for provided key.
 * - Shift+Click: toggle Help Mode overlay (highlights explainable areas).
 */
export default function HelpBadge({
  k,
  month,
  withContext = true,
  className = "ml-2",
  title = "Help",
}: { k: string; month?: string; withContext?: boolean; className?: string; title?: string }) {
  const { open, setOpen, loading, text, explain } = useExplain();
  const btnRef = React.useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });

  async function onClick(e: React.MouseEvent) {
    if (e.shiftKey) {
      // Toggle Help Mode overlay via custom event
      window.dispatchEvent(new CustomEvent("help-mode:toggle"));
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    const width = 340;
    const padding = 8;
    setPos({
      top: ((rect?.bottom ?? 0) + 8),
      left: Math.max(padding, Math.min((rect?.left ?? 0), (window.innerWidth - width - padding))),
    });
    await explain(k, { month, withContext });
  }

  const popId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const pop = document.querySelector('[data-popover-role="help-badge"]') as HTMLElement | null;
      if (pop && !pop.contains(target) && btnRef.current && !btnRef.current.contains(target)) {
        setOpen(false);
      }
    };
    const onReposition = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      const width = 340;
      const padding = 8;
      setPos({
        top: ((rect?.bottom ?? 0) + 8),
        left: Math.max(padding, Math.min((rect?.left ?? 0), (window.innerWidth - width - padding))),
      });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick, true);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, setOpen]);
  return (
    <>
      <button
        ref={btnRef}
        aria-label="Explain this"
        aria-expanded={open ? true : false}
        aria-controls={open ? popId : undefined}
        title={`${title} (Shift+Click to toggle Help mode)`}
        className={`${pillIconClass} h-5 w-5 text-[11px] leading-none ${className}`}
        onClick={onClick}
      >
        ?
      </button>

      {open && createPortal(
        <div id={popId} data-popover-role="help-badge" className="fixed z-[9999] w-[340px] rounded-xl border bg-background p-3 shadow-xl animate-in fade-in-0 zoom-in-95" style={{ top: pos.top, left: pos.left }}>
          <div className="flex items-center justify-between">
            <div className="font-medium">What am I looking at?</div>
            <Button variant="pill-ghost" className="h-7 px-2 text-xs" onClick={() => { setOpen(false); btnRef.current?.focus?.(); } }>Close</Button>
          </div>
          <div className="mt-2 text-sm whitespace-pre-wrap max-h-[50vh] overflow-auto">
            {loading ? "Loading…" : text}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
