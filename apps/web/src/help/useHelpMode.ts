import { useEffect, useRef, useState } from "react";
import { helpRegistry, DEFAULT_HELP } from "./helpRegistry";

type Target = { el: HTMLElement; key: string };

export function useHelpMode() {
  const [active, setActive] = useState(false);
  const [current, setCurrent] = useState<{ key: string; rect: DOMRect } | null>(null);
  const targetsRef = useRef<Target[]>([]);
  const overlaysRef = useRef<HTMLElement[]>([]);

  useEffect(() => {
    if (!active) { clearOverlays(); return; }

    const scan = () => {
      targetsRef.current = Array.from(document.querySelectorAll<HTMLElement>("[data-help-key]"))
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ el, key: el.dataset.helpKey! }));
      drawOverlays();
    };

    const mo = new MutationObserver(() => scan());
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });

    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-help-key]");
      if (!el) return;
      const key = el.dataset.helpKey!;
      const rect = el.getBoundingClientRect();
      setCurrent({ key, rect });
      e.preventDefault();
      e.stopPropagation();
    };

    scan();
    window.addEventListener("click", onClick, true);
    window.addEventListener("resize", drawOverlays);
    window.addEventListener("scroll", drawOverlays, true);
    return () => {
      mo.disconnect();
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("resize", drawOverlays);
      window.removeEventListener("scroll", drawOverlays, true);
      clearOverlays();
    };
  }, [active]);

  function drawOverlays() {
    clearOverlays();
    overlaysRef.current = targetsRef.current.map((t) => {
      const r = t.el.getBoundingClientRect();
      const ring = document.createElement("div");
      ring.className = "help-ring";
      Object.assign(ring.style, {
        position: "fixed",
        left: `${r.left - 6}px`,
        top: `${r.top - 6}px`,
        width: `${r.width + 12}px`,
        height: `${r.height + 12}px`,
        borderRadius: "12px",
        outline: "3px solid #f2b84b",
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
        pointerEvents: "none",
        zIndex: "60",
      } as CSSStyleDeclaration);
      document.body.appendChild(ring);
      return ring;
    });
  }

  function clearOverlays() {
    overlaysRef.current.forEach((n) => n.remove());
    overlaysRef.current = [];
  }

  function getContent(key: string) {
    return helpRegistry[key] ?? DEFAULT_HELP;
  }

  return { active, setActive, current, setCurrent, getContent };
}
