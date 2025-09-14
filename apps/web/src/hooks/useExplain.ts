import { useState } from "react";
import { uiHelp } from "@/lib/api";
import { agentChat } from "@/lib/api";

// simple in-memory cache per tab
const cache = new Map<string, { t: number; text: string }>();
const TTL = 5 * 60 * 1000; // 5 minutes

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

export function useExplain() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string>("");

  async function explain(key: string, opts?: { month?: string; withContext?: boolean }) {
    const t0 = performance.now?.() ?? Date.now();
    const ck = `${key}:${opts?.month || ""}:${!!opts?.withContext}`;
    const hit = cache.get(ck);
    if (hit && (Date.now() - hit.t) < TTL) {
      setOpen(true);
      setText(hit.text);
      return;
    }

    setOpen(true); setLoading(true);
    try {
      const res: any = await uiHelp.describe(key, opts?.month, !!opts?.withContext);
      const base = res?.help || {};
      const ctx = res?.context || null;

      const prompt = [
        "Explain the following UI widget to a new user in 4–6 short bullets.",
        "Be clear and non-technical. Include how to read it.",
        ctx ? "Use the provided context to cite one concrete example." : "",
        `HELP_SPEC: ${JSON.stringify(base)}`,
        ctx ? `CONTEXT: ${JSON.stringify(ctx).slice(0, 6000)}` : "",
      ].filter(Boolean).join("\n");

      try {
        const reply: any = await agentChat([{ role: "user", content: prompt }]);
        const raw = (reply?.reply || "").trim();
        const tooShort = !raw || raw.length < 20 || /^ok\.?$/i.test(raw);
        const txt = tooShort ? formatFallback(base, ctx) : raw;
        setText(txt);
        cache.set(ck, { t: Date.now(), text: txt });
      } catch {
        const txt = formatFallback(base, ctx);
        setText(txt);
        cache.set(ck, { t: Date.now(), text: txt });
      }
    } finally {
      setLoading(false);
      const t1 = performance.now?.() ?? Date.now();
      // dev-only telemetry
      if ((import.meta as any)?.env?.DEV && typeof console !== 'undefined') {
        console.debug?.("[ui-help] explain", {
          help_key: key,
          with_context: !!opts?.withContext,
          month: opts?.month,
          ms: Math.round(Math.max(0, t1 - t0)),
        });
      }
    }
  }

  return { open, setOpen, loading, text, explain };
}
