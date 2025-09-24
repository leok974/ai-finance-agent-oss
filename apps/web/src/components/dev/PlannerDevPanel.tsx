import React, { useCallback, useEffect, useState } from "react";
import { agentPlanPreview, agentPlanApply, agentPlanStatus, type PlannerPlanItem, downloadReportExcel } from "@/lib/api";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

  // Derived UI aliases (no logic change)
  const planItems: PlannerPlanItem[] = (plan?.items as PlannerPlanItem[] | undefined) ?? [];
  const onPlanAndRun = onApply;
  const onCopyJson = copyJson;
  const status = {
    mode: (plan as any)?.mode,
    steps: planItems.length,
    throttle: throttle ? `${throttle.rate_per_min}/min · cap ${throttle.capacity} · tokens ${throttle.tokens}` : undefined,
  } as { mode?: string; steps?: number; throttle?: string };

  return (
  <section id="planner-dev" className={cn("panel-tight md:p-5 lg:p-6", className)}>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold">Planner DevTool</h2>
        <span className="pill">dev-only</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* LEFT: Prompt */}
        <div>
          <div className="text-sm opacity-80 mb-2">Natural-language planner prompt</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="input-muted w-full min-h-[120px] text-sm placeholder:text-white/40"
            placeholder='e.g., "Give me my top merchants for July and generate a PDF"'
          />
          <div className="mt-3 flex items-center gap-2">
            <Switch id="bypass" checked={bypassThrottle} onCheckedChange={setBypassThrottle} />
            <Label htmlFor="bypass" className="text-sm select-none">Bypass planner throttle</Label>
          </div>
        </div>

        {/* RIGHT: Status */}
        <div>
          <div className="text-sm opacity-80 mb-2 flex items-center justify-between">
            <span>Planner status</span>
            {/* keep your little refresh/search icon button if you had one */}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
            <div className="grid grid-cols-3 gap-2">
              <div className="opacity-70">Mode:</div><div className="col-span-2">{status?.mode ?? "—"}</div>
              <div className="opacity-70">Steps:</div><div className="col-span-2">{status?.steps ?? 0}</div>
              <div className="opacity-70">Throttle:</div><div className="col-span-2">{status?.throttle ?? "—"}</div>
            </div>

            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="mb-2 text-sm opacity-80">Plan items</div>
              {planItems?.length ? (
                <ul className="space-y-1">
                  {planItems.map((it, i) => (
                    <li key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg bg-white/5 px-2 py-1">
                      <span className="text-xs opacity-70">{it.kind}</span>
                      <span className="text-xs truncate">{(it as any).title ?? (it as any).description ?? (it as any).path ?? ""}</span>
                      <span className="pill">{(it as any).status ?? "pending"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs opacity-70">No plan yet. Click <span className="font-medium">Preview Plan</span>.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-between mt-4">
        <div className="flex items-center gap-2">
          <Button onClick={onPreview} className="px-3 py-1.5 text-sm">Preview Plan</Button>
          <Button variant="pill-primary" onClick={onPlanAndRun} className="gap-2 h-9 px-4">Plan &amp; Run</Button>
          <Button variant="pill-outline" onClick={onCopyJson}>Copy JSON</Button>
        </div>
      </div>
    </section>
  );
}

/**
 * Handle post-apply behaviors (export, etc.).
 * Prefer backend `report_url` if present; otherwise fall back to client Excel builder.
 * Designed to be unit-tested.
 */
async function handleApply(args: {
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
