import { useEffect } from "react";
import { openHelpPanel } from "@/features/help/HelpPanel";
import { uiHelp } from "@/lib/api";

function textToHtml(t: string) {
  return `<p>${t.replace(/\n/g, "<br/>")}</p>`;
}

function formatFallback(base: any, ctx?: any) {
  if (!base) return "This widget shows a chart or card in the current view.";
  const bullets = [
    `• ${base.what || base.title || "Overview"}`,
    ...((base.how_to_read || []).slice(0, 3).map((x: string) => `• ${x}`)),
    ...(base.tips ? [`• Tip: ${base.tips[0]}`] : []),
    ...(ctx?.data ? [
      `• Example: data available for the selected month.`
    ] : []),
  ];
  return bullets.join("\n");
}

async function fetchDescribe(opts: { target: string; id?: string | null }) {
  try {
    const res: any = await uiHelp.describe(opts.target, opts.id || undefined, true);
    const base = res?.help || {};
    const ctx = res?.context || null;
    const text = formatFallback(base, ctx);
    return { html: "", text };
  } catch (e) {
    return { html: "", text: "No details returned." };
  }
}

function getHelpElFromEvent(e: MouseEvent) {
  const path = (e.composedPath?.() ?? []) as Array<EventTarget>;
  for (const n of path) {
    if (n instanceof HTMLElement && n.hasAttribute("data-help-target")) return n;
  }
  return (e.target as HTMLElement)?.closest?.<HTMLElement>("[data-help-target]") ?? null;
}

export function useHelpClicks(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onClick = async (e: MouseEvent) => {
      const el = getHelpElFromEvent(e);
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();

      document
        .querySelectorAll<HTMLElement>("[data-help-active='true']")
        .forEach((x) => x.removeAttribute("data-help-active"));
      el.setAttribute("data-help-active", "true");

      const target = el.getAttribute("data-help-target")!;
      const id = el.getAttribute("data-help-id") || undefined;
      const title = el.getAttribute("data-help-title") || el.querySelector("h3,h4")?.textContent || "This card";

      try {
        const { html, text } = await fetchDescribe({ target, id: id || null });
        const body = (html && html.trim()) || (text && textToHtml(text)) || "<p>No details returned.</p>";
        const r = el.getBoundingClientRect();
        openHelpPanel({ title: "What am I looking at?", html: body, anchorRect: r });
      } catch (err) {
        openHelpPanel({
          title: "What am I looking at?",
          html: `<p>Sorry—couldn’t load the explanation.</p><pre class="mt-2 text-xs opacity-70">${String(err)}</pre>`,
          anchorRect: el.getBoundingClientRect(),
        });
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active]);
}
