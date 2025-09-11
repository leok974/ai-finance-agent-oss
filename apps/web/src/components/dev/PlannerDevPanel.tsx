import React, { useCallback, useEffect, useState } from "react";
import { agentPlanDebug, agentPlanStatus, type AgentPlanDebug, type PlannerPlanItem, downloadReportExcel } from "@/lib/api";
import { Button } from "@/components/ui/button";
import Card from "@/components/Card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Wand2, Play, FileSpreadsheet, RefreshCcw, Beaker, Copy } from "lucide-react";

export default function PlannerDevPanel() {
  const [q, setQ] = useState<string>(() => localStorage.getItem("planner:q") || "Give me my top merchants for July and generate a PDF");
  const [resp, setResp] = useState<AgentPlanDebug | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bypass, setBypass] = useState<boolean>(() => {
    const urlBypass = new URLSearchParams(location.search).get("bypass") === "1";
    const saved = localStorage.getItem("planner:bypass") === "1";
    return urlBypass || saved;
  });
  const [throttle, setThrottle] = useState<{ rate_per_min: number; capacity: number; tokens: number } | null>(null);
  const [statusRefreshing, setStatusRefreshing] = useState(false);

  useEffect(() => {
    localStorage.setItem("planner:q", q);
  }, [q]);

  const doPlan = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await agentPlanDebug(q, { run: false, bypass });
      setResp(r);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to plan");
    } finally {
      setLoading(false);
    }
  }, [q, bypass]);

  const doPlanRun = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await agentPlanDebug(q, { run: true, bypass });
      setResp(r);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to execute");
    } finally {
      setLoading(false);
    }
  }, [q, bypass]);

  const loadStatus = useCallback(async () => {
    try {
      setStatusRefreshing(true);
      const r = await agentPlanStatus();
      setThrottle(r.throttle);
    } catch {
      // ignore
    } finally {
      setStatusRefreshing(false);
    }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { localStorage.setItem("planner:bypass", bypass ? "1" : "0"); }, [bypass]);

  const copyJson = useCallback(async () => {
    const data = resp ? JSON.stringify(resp, null, 2) : JSON.stringify({ q, bypass }, null, 2);
    await navigator.clipboard.writeText(data);
  }, [resp, q, bypass]);

  return (
    <Card className={cn("mt-6 mx-auto max-w-4xl p-4 md:p-6")}> 
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Planner DevTool</h2>
          <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">dev-only</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 w-9 rounded-md"
              onClick={loadStatus}
              disabled={statusRefreshing}
              aria-label="Refresh status"
            >
              <RefreshCcw className={cn("h-4 w-4", statusRefreshing && "animate-spin")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh status</TooltipContent>
        </Tooltip>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-3">
        {/* Left: Prompt */}
        <div className="lg:col-span-2">
          <label htmlFor="planner-prompt" className="text-sm text-muted-foreground block mb-1">
            Natural-language planner prompt
          </label>
          <textarea
            id="planner-prompt"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            rows={4}
            className="w-full rounded-xl bg-background text-foreground border border-border px-3 py-2
                       placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder='e.g., "Give me my top merchants for July and generate a PDF"'
          />
          {/* Advanced toggles */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={bypass}
                onChange={(e) => setBypass(e.target.checked)}
              />
              Bypass planner throttle
            </label>
          </div>
        </div>

        {/* Right: Mini status / plan meta */}
        <div className="rounded-xl border border-border p-3 bg-muted/30">
          <div className="text-sm text-muted-foreground mb-2">Planner status</div>
          <div className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">Mode:</span> {resp?.mode ?? "—"}</div>
            <div><span className="text-muted-foreground">Steps:</span> {resp?.plan?.steps?.length ?? 0}</div>
            <div>
              <span className="text-muted-foreground">Throttle:</span>{" "}
              {throttle ? `${Math.floor(throttle.tokens)}/${throttle.capacity} • ${throttle.rate_per_min}/min` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={doPlan} disabled={loading || !q.trim()} className="gap-2">
          <Wand2 className="h-4 w-4" />
          {loading ? "Planning…" : "Preview Plan"}
        </Button>

        <Button onClick={doPlanRun} disabled={loading || !q.trim()} className="gap-2" variant="secondary">
          <Play className={cn("h-4 w-4", loading && "animate-pulse")} />
          {loading ? "Running…" : "Plan & Run"}
        </Button>

        <Button onClick={copyJson} variant="ghost" className="gap-2" disabled={!q.trim() && !resp}>
          <Copy className="h-4 w-4" />
          Copy JSON
        </Button>

        {/* Spacer */}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" className="gap-2 h-8 px-2" onClick={doPlan} disabled={loading || !q.trim()}>
            <Beaker className="h-4 w-4" />
            Plan
          </Button>
          <Button variant="ghost" className="gap-2 h-8 px-2" onClick={doPlanRun} disabled={loading || !q.trim()}>
            <FileSpreadsheet className="h-4 w-4" />
            Plan &amp; Run
          </Button>
        </div>
      </div>

      {/* Inline status messages */}
      {loading && (
        <div className="mt-2 text-sm text-muted-foreground">Planning…</div>
      )}
      {err && (
        <div className="mt-2 text-sm text-red-500">{err}</div>
      )}
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
