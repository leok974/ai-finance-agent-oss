import React, { useCallback, useEffect, useState } from "react";
import { agentPlanPreview, agentPlanApply, agentPlanStatus, type PlannerPlanItem, downloadReportExcel } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export default function PlannerDevPanel({ className }: { className?: string }) {
  const [prompt, setPrompt] = useState<string>(() => localStorage.getItem("planner:q") || "Give me my top merchants for July and generate a PDF");
  const [plan, setPlan] = useState<any>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [bypassThrottle, setBypassThrottle] = useState<boolean>(() => {
    const urlBypass = new URLSearchParams(location.search).get("bypass") === "1";
    const saved = localStorage.getItem("planner:bypass") === "1";
    return urlBypass || saved;
  });
  const [throttle, setThrottle] = useState<{ rate_per_min: number; capacity: number; tokens: number } | null>(null);
  const [selected, setSelected] = useState<PlannerPlanItem[]>([]);

  useEffect(() => {
    localStorage.setItem("planner:q", prompt);
  }, [prompt]);

  const onPreview = useCallback(async () => {
    setPreviewing(true);
    try {
  const res = await agentPlanPreview({ month: null, prompt });
      setPlan(res);
      setSelected(res.items ?? []);
    } catch (e) {
      // Show minimal inline error via console; dev panel
      console.error(e);
    } finally {
      setPreviewing(false);
    }
  }, []);

  const onApply = useCallback(async () => {
    if (!plan || applying) return;
    setApplying(true);
    try {
  const res: any = await agentPlanApply({ month: plan?.month ?? null, actions: selected as any });
      const ack = res?.ack ?? "Planner applied.";
      const msg = typeof ack === "string" ? ack : ack?.deterministic ?? "Planner applied.";
      // Keep dev-panel minimal: log ack; main toasts are elsewhere
      console.log(msg);
      await handleApply({ res, month: plan?.month, selected });
    } catch (e) {
      console.error(e);
    } finally {
      setApplying(false);
    }
  }, [plan, selected, applying]);

  const loadStatus = useCallback(async () => {
    try {
      const r = await agentPlanStatus();
      setThrottle(r.throttle);
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { localStorage.setItem("planner:bypass", bypassThrottle ? "1" : "0"); }, [bypassThrottle]);

  const copyJson = useCallback(async () => {
    const data = plan ? JSON.stringify(plan, null, 2) : JSON.stringify({ prompt, bypassThrottle }, null, 2);
    await navigator.clipboard.writeText(data);
  }, [plan, prompt, bypassThrottle]);

  const allSelected = (plan?.items?.length || 0) > 0 && selected.length === (plan?.items?.length || 0);

  function toggleItem(item: PlannerPlanItem) {
    setSelected((prev) => (prev.includes(item) ? prev.filter((p) => p !== item) : [...prev, item]));
  }
  function toggleAll() {
    if (!plan?.items?.length) return;
    setSelected(allSelected ? [] : [...plan.items]);
  }

  return (
    <Card className={cn("col-span-12 lg:col-span-7", className)}>
      <CardHeader className="py-3">
        <CardTitle className="text-base">
          Planner DevTool <span className="ml-2 text-[10px] rounded bg-white/10 px-1.5 py-0.5 opacity-70">dev-only</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* prompt textarea */}
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-white/10 bg-neutral-900/60 px-3 py-2 text-sm outline-none focus:border-white/20"
          placeholder="Give me my top merchants for July and generate a PDF"
        />

        {/* throttle switch */}
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={bypassThrottle} onCheckedChange={setBypassThrottle} />
          Bypass planner throttle
        </label>

        {/* buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onPreview} className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10">
            Preview Plan
          </button>
          <button onClick={onApply} className="inline-flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/15">
            Plan &amp; Run
          </button>
        </div>

        {/* compact plan items */}
        <div className="rounded-lg border border-white/10 bg-neutral-900/40 p-2">
          {!plan?.items?.length ? (
            <div className="text-sm opacity-70">No plan yet. Click <span className="underline">Preview Plan</span>.</div>
          ) : (
            <ul className="space-y-1 text-sm leading-tight">
              {plan.items.map((it: PlannerPlanItem, i: number) => (
                <li key={i} className="grid grid-cols-12 items-center gap-2 rounded-md bg-white/5 px-2 py-1.5">
                  <span className="col-span-6 truncate">{(it as any).title ?? it.kind}</span>
                  <span className="col-span-3 text-xs opacity-70">{it.kind}</span>
                  <span className="col-span-3 text-right text-xs opacity-70">{(it as any).status ?? "queued"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Handle post-apply behaviors (export, etc.).
 * Prefer backend `report_url` if present; otherwise fall back to client Excel builder.
 * Designed to be unit-tested.
 */
export async function handleApply(args: {
  res: any;                 // response from agentPlanApply(...)
  month?: string;           // month string like "2025-08"
  selected: PlannerPlanItem[];
}) {
  const { res, month, selected } = args;

  const wantsExport = (selected || []).some((a) => a.kind === "export_report");
  const reportUrl: string | undefined = res?.report_url;

  if (wantsExport) {
    if (reportUrl) {
      // single source of truth when backend provides URL
      window.location.href = reportUrl;
    } else if (month) {
      // client-side fallback
      await downloadReportExcel(month, true, { splitAlpha: true });
    } else {
      // Explicit breadcrumb to help debug empty-month states
      console.warn(
        "[Planner] export_report requested but no month resolved and no report_url from backend."
      );
    }
  }
  return res;
}
