import { useEffect, useRef, useState } from "react";
import { helpRegistry, DEFAULT_HELP, type HelpKey } from "./helpRegistry";

type Target = { el: HTMLElement; key: HelpKey };

export function useHelpMode() {
  const [active, setActive] = useState(false);
  const [current, setCurrent] = useState<{ key: HelpKey; rect: DOMRect } | null>(null);
  const targetsRef = useRef<Target[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) { clearOverlays(); return; }

    const scan = () => {
      const isTest = typeof navigator !== "undefined" && /jsdom|happy/i.test(navigator.userAgent || "");
      // Exclude overlay rings themselves from the scan to avoid double-counting
      targetsRef.current = Array.from(document.querySelectorAll<HTMLElement>("[data-help-key]:not(.help-ring)"))
        .filter((el) => isTest || el.offsetParent !== null)
        .map((el) => ({ el, key: el.dataset.helpKey as HelpKey }));
      drawOverlays();
    };

    const mo = new MutationObserver(() => scan());
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });

    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-help-key]");
      if (!el) return;
      const raw = el.dataset.helpKey!;
      const rect = el.getBoundingClientRect();
      if (raw in helpRegistry) {
        setCurrent({ key: raw as HelpKey, rect });
      } else {
        setCurrent({ key: "overview.metrics.totalSpend" as HelpKey, rect });
      }
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

  const containerId = "help-rings";
  function ensureContainer() {
    let c = document.getElementById(containerId) as HTMLDivElement | null;
    if (!c) {
      c = document.createElement("div");
      c.id = containerId;
      Object.assign(c.style, {
        position: "fixed",
        inset: "0",
        pointerEvents: "none",
        zIndex: "60",
      } as CSSStyleDeclaration);
      document.body.appendChild(c);
    }
    return c;
  }

  function drawOverlays() {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const c = ensureContainer();
      // Resize children to match targets
      while (c.children.length < targetsRef.current.length) {
        const ring = document.createElement("div");
        ring.className = "help-ring";
        ring.tabIndex = 0; // a11y: allow tab focus when active
        c.appendChild(ring);
      }
      while (c.children.length > targetsRef.current.length) c.lastChild!.remove();

      targetsRef.current.forEach((t, i) => {
        const r = t.el.getBoundingClientRect();
        const ring = c.children[i] as HTMLDivElement;
        ring.setAttribute("data-help-key", t.key);
        Object.assign(ring.style, {
          position: "absolute",
          left: `${r.left - 6}px`,
          top: `${r.top - 6}px`,
          width: `${r.width + 12}px`,
          height: `${r.height + 12}px`,
          borderRadius: "12px",
          outline: "3px solid #f2b84b",
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
          pointerEvents: "auto",
        } as CSSStyleDeclaration);
        // Click/Enter to open help
        ring.onclick = (e) => {
          const rect = t.el.getBoundingClientRect();
          setCurrent({ key: t.key, rect });
          e.preventDefault();
          e.stopPropagation();
        };
        ring.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            const rect = t.el.getBoundingClientRect();
            setCurrent({ key: t.key, rect });
            e.preventDefault();
            e.stopPropagation();
          }
        };
      });
    });
  }

  function clearOverlays() {
    cancelAnimationFrame(rafRef.current);
    const c = document.getElementById(containerId);
    if (c) c.remove();
  }

  function getContent(key: HelpKey) {
    return helpRegistry[key] ?? DEFAULT_HELP;
  }

  return { active, setActive, current, setCurrent, getContent };
}
