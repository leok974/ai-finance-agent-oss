import React, { useCallback, useEffect, useState } from "react";
import { agentPlanPreview, agentPlanApply, agentPlanStatus, type PlannerPlanItem, downloadReportExcel } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import Card from "@/components/Card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Wand2, Play, FileSpreadsheet, RefreshCcw, Beaker, Copy, MessageSquareText, ListChecks, Sparkles, PiggyBank, CheckSquare } from "lucide-react";

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
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [selected, setSelected] = useState<PlannerPlanItem[]>([]);

  useEffect(() => {
    localStorage.setItem("planner:q", prompt);
  }, [prompt]);

  const onPreview = useCallback(async () => {
    setPreviewing(true);
    try {
      const res = await agentPlanPreview(undefined);
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
      const res: any = await agentPlanApply(plan?.month, selected);
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
  useEffect(() => { localStorage.setItem("planner:bypass", bypassThrottle ? "1" : "0"); }, [bypassThrottle]);

  const copyJson = useCallback(async () => {
    const data = plan ? JSON.stringify(plan, null, 2) : JSON.stringify({ prompt, bypassThrottle }, null, 2);
    await navigator.clipboard.writeText(data);
  }, [plan, prompt, bypassThrottle]);

  const chars = prompt.length;
  const charHint = chars > 240 ? "text-amber-400" : "text-muted-foreground";
  const allSelected = (plan?.items?.length || 0) > 0 && selected.length === (plan?.items?.length || 0);

  function toggleItem(item: PlannerPlanItem) {
    setSelected((prev) => (prev.includes(item) ? prev.filter((p) => p !== item) : [...prev, item]));
  }
  function toggleAll() {
    if (!plan?.items?.length) return;
    setSelected(allSelected ? [] : [...plan.items]);
  }

  return (
    <Card className={cn("mt-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Planner DevTool</h2>
          <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">dev-only</span>
        </div>
        <Button
          variant="ghost"
          className="h-9 w-9 rounded-md"
          onClick={loadStatus}
          disabled={statusRefreshing}
          aria-label="Refresh status"
        >
          <RefreshCcw className={cn("h-4 w-4", statusRefreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-3">
        {/* Left: Prompt (prettier textarea) */}
        <div className="lg:col-span-2">
          <label htmlFor="planner-prompt" className="text-sm text-muted-foreground block mb-1">
            Natural-language planner prompt
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-3 top-2.5 text-muted-foreground/70">
              <MessageSquareText className="h-4 w-4" />
            </div>
            <textarea
              id="planner-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full rounded-xl bg-background text-foreground border border-border pl-9 pr-14 py-2
                         placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder='e.g., "Give me my top merchants for July and generate a PDF"'
            />
            <div className={cn("absolute right-3 bottom-2 text-xs", charHint)}>{chars}</div>
          </div>

          {/* Advanced toggles */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id="planner-throttle" checked={bypassThrottle} onCheckedChange={setBypassThrottle} />
              <label htmlFor="planner-throttle" className="text-sm text-muted-foreground">Bypass planner throttle</label>
            </div>
          </div>
        </div>

        {/* Right: Plan meta + compact items */}
        <div className="rounded-xl border border-border p-3 bg-muted/30">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-muted-foreground">Planner status</div>
            <Button variant="ghost" className="h-7 px-2 py-1 text-xs" onClick={toggleAll} disabled={!plan?.items?.length}>
              {allSelected ? "Unselect all" : "Select all"}
            </Button>
          </div>

          <div className="space-y-1 text-sm mb-3">
            <div><span className="text-muted-foreground">Month:</span> {plan?.month ?? "—"}</div>
            <div><span className="text-muted-foreground">Items:</span> {plan?.items?.length ?? 0}</div>
            <div>
              <span className="text-muted-foreground">Throttle:</span>{" "}
              {throttle ? `${Math.floor(throttle.tokens)}/${throttle.capacity} • ${throttle.rate_per_min}/min` : "—"}
            </div>
          </div>

          {/* Compact plan items */}
          <div className="text-sm text-muted-foreground mb-1">Plan items</div>
          <div className="rounded-lg border border-border bg-background/60">
            <ScrollArea className="h-44">
              {!plan?.items?.length ? (
                <div className="p-3 text-sm text-muted-foreground/70">No plan yet. Click <b>Preview Plan</b>.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {plan.items.map((it: PlannerPlanItem, idx: number) => {
                    const checked = selected.includes(it);
                    return (
                      <li key={idx} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40">
                        <Checkbox checked={checked} onCheckedChange={() => toggleItem(it)} />
                        <div className="shrink-0 text-muted-foreground">
                          {it.kind === "categorize_unknowns" ? (
                            <ListChecks className="h-4 w-4" />
                          ) : it.kind === "seed_rule" ? (
                            <Sparkles className="h-4 w-4" />
                          ) : it.kind === "budget_limit" ? (
                            <PiggyBank className="h-4 w-4" />
                          ) : it.kind === "export_report" ? (
                            <FileSpreadsheet className="h-4 w-4" />
                          ) : (
                            <CheckSquare className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="line-clamp-1">{(it as any).title ? (it as any).title : it.kind}</div>
                          <div className="text-xs text-muted-foreground">
                            {it.kind === "categorize_unknowns" && Array.isArray((it as any).txn_ids) ? `${(it as any).txn_ids.length} txns` : null}
                            {it.kind === "budget_limit" && (it as any).category ? ` • ${(it as any).category} → ${(it as any).limit}` : null}
                          </div>
                        </div>
                        {(it as any).impact ? (
                          <Badge variant="secondary" className="shrink-0">{(it as any).impact}</Badge>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={onPreview} disabled={previewing} className="gap-2">
          <Wand2 className="h-4 w-4" />
          {previewing ? "Previewing…" : "Preview Plan"}
        </Button>

        <Button onClick={onApply} disabled={!plan || !selected.length || applying} className="gap-2" variant="secondary">
          <Play className={cn("h-4 w-4", applying && "animate-pulse")} />
          {applying ? "Applying…" : `Apply Selected (${selected.length || 0})`}
        </Button>

        <Button onClick={copyJson} variant="ghost" className="gap-2">
          <Copy className="h-4 w-4" />
          Copy JSON
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" className="gap-2 h-8 px-2" onClick={onPreview} disabled={previewing}>
            <Wand2 className="h-4 w-4" />
            Plan
          </Button>
          <Button variant="ghost" className="gap-2 h-8 px-2" onClick={onApply} disabled={!plan || !selected.length || applying}>
            <FileSpreadsheet className="h-4 w-4" />
            Plan &amp; Run
          </Button>
        </div>
      </div>
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
