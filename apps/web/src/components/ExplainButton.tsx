import * as React from "react";
import { createPortal } from "react-dom";
import { useExplain } from "@/hooks/useExplain";
import { Button, pillIconClass } from "@/components/ui/button";

export default function ExplainButton({
  k, month, withContext = true, className = "ml-2",
}: { k: string; month?: string; withContext?: boolean; className?: string }) {
  const btnRef = React.useRef<HTMLButtonElement | null>(null);
  const { open, setOpen, loading, text, explain } = useExplain();
  const [pos, setPos] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });

  async function openHelp() {
    const rect = btnRef.current?.getBoundingClientRect();
    const width = 340;
    const padding = 8;
    setPos({
      top: ((rect?.bottom ?? 0) + 8),
      left: Math.max(padding, Math.min((rect?.left ?? 0), (window.innerWidth - width - padding))),
    });
    await explain(k, { month, withContext });
  }

  const popover = (open && typeof window !== 'undefined' && document.body) ? createPortal(
    <div
      id="ui-help-popover"
      className="fixed z-[9999] w-[340px] rounded-xl border bg-background p-3 shadow-xl animate-in fade-in-0 zoom-in-95"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label="What am I looking at?"
    >
      <div className="flex items-center justify-between">
        <div className="font-medium">What am I looking at?</div>
        <button className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>Close</button>
      </div>
      <div className="mt-2 text-sm whitespace-pre-wrap max-h-[50vh] overflow-auto">
        {loading ? "Loading…" : text}
      </div>
    </div>,
    document.body
  ) : null;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const pop = document.getElementById("ui-help-popover");
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
        className={`${pillIconClass} h-5 w-5 text-[11px] ${className}`}
        onClick={openHelp}
      >?
      </button>
      {popover}
    </>
  );
}
