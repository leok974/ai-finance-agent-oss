import * as React from "react";
import ReactDOM from "react-dom";

type SideDrawerProps = {
  open: boolean;
  onClose: () => void;
  maxWidth?: number; // e.g., 460
  title?: React.ReactNode;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  className?: string; // extra classes for panel
};

export default function SideDrawer({
  open,
  onClose,
  maxWidth = 460,
  title,
  headerExtra,
  children,
  className = "",
}: SideDrawerProps) {
  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => (e.key === "Escape" ? onClose() : null);
    window.addEventListener("keydown", onEsc);
    // lock body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9998]" role="dialog" aria-modal>
      {/* overlay BEHIND the panel */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* bright panel ABOVE the overlay */}
      <aside
        className={[
          "absolute right-0 top-0 h-full w-full overflow-y-auto",
          "bg-[rgb(26,28,33)] text-zinc-100", // brighter than page bg
          "ring-1 ring-white/10 border-l border-white/5",
          "shadow-2xl z-[1]",
          `max-w-[${maxWidth}px]`,
          className,
        ].join(" ")}
      >
        {(title || headerExtra) && (
          <header className="sticky top-0 bg-[rgb(26,28,33)]/95 backdrop-blur px-4 py-3 border-b border-white/5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{title}</h2>
              <button
                onClick={onClose}
                className="text-sm opacity-80 hover:opacity-100"
                aria-label="Close"
              >
                Close
              </button>
            </div>
            {headerExtra && <div className="mt-2">{headerExtra}</div>}
          </header>
        )}
        <div className="px-4 py-4">{children}</div>
      </aside>
    </div>,
    document.body
  );
}
