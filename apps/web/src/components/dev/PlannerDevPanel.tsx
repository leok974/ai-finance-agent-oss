import React, { useCallback, useEffect, useMemo, useState } from "react";
import { agentPlanDebug, agentPlanStatus, type AgentPlanDebug, type PlannerPlanItem, downloadReportExcel } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// simple separator helper
const Sep = ({ className = "" }: { className?: string }) => (
  <div role="separator" className={`my-3 border-t border-neutral-800 ${className}`} />
);

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
      const r = await agentPlanStatus();
      setThrottle(r.throttle);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { localStorage.setItem("planner:bypass", bypass ? "1" : "0"); }, [bypass]);

  const copyJson = useCallback(async () => {
    if (!resp) return;
    await navigator.clipboard.writeText(JSON.stringify(resp, null, 2));
  }, [resp]);

  const pdfLink = (resp && resp.mode === "executed" && (resp as any).artifacts?.pdf_url) || null;
  const excelLink = (resp && resp.mode === "executed" && (resp as any).artifacts?.excel_url) || null;

  const apiBase = (import.meta as any).env?.VITE_API_BASE || "";

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Planner DevTool</h1>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">dev-only</Badge>
          <Badge variant="outline">
            {throttle ? `${Math.floor(throttle.tokens)}/${throttle.capacity} • ${throttle.rate_per_min}/min` : "—"}
          </Badge>
        </div>
      </div>

      <p className="text-sm opacity-80">
        Enter a natural language prompt. <span className="font-medium">Plan</span> calls the dev endpoint (no execution).
        <span className="px-1" /> <span className="font-medium">Plan &amp; Run</span> executes tools and returns links.
      </p>

      <textarea
        value={q}
        onChange={(e) => setQ(e.target.value)}
        rows={3}
        className="w-full rounded-md border bg-background p-3 text-sm"
        placeholder='e.g., "Give me my top merchants for July and generate a PDF"'
      />

      <div className="flex gap-2 items-center">
        <Button disabled={loading || !q.trim()} onClick={doPlan}>Plan</Button>
        <Button disabled={loading || !q.trim()} variant="secondary" onClick={doPlanRun}>Plan &amp; Run</Button>
        <Button disabled={!resp} variant="ghost" onClick={copyJson}>Copy JSON</Button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={bypass} onChange={(e) => setBypass(e.target.checked)} />
          Bypass planner throttle
        </label>
        <Button variant="ghost" onClick={loadStatus}>Refresh status</Button>
      </div>

      {loading && <div className="text-sm">Planning…</div>}
      {err && <div className="text-sm text-red-500">{err}</div>}

      {resp && (
        <div className="rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge>{resp.mode}</Badge>
              {resp.mode === "executed" && <Badge variant="outline">preview</Badge>}
            </div>
            <div className="text-xs opacity-60">/agent/plan/debug</div>
          </div>

          <Sep />

          <div className="space-y-2">
            <div className="text-sm font-medium">Steps</div>
            <ol className="list-decimal pl-5 text-sm">
              {resp.plan.steps.map((s: any, i: number) => (
                <li key={i}>
                  <code className="rounded bg-muted px-1 py-0.5">{s.tool}</code>{" "}
                  <span className="opacity-70">{JSON.stringify(s.args)}</span>
                </li>
              ))}
            </ol>

            {resp.mode === "executed" && (
              <>
                <Sep />
                <div className="space-y-2">
                  <div className="text-sm font-medium">Reply preview</div>
                  {/* reply_preview already includes human summary + link text */}
                  <div className="text-sm">{(resp as any).reply_preview}</div>

                  {(pdfLink || excelLink) && (
                    <div className="flex gap-4 pt-1">
                      {pdfLink && (
                        <a
                          className="underline text-primary"
                          href={apiBase + pdfLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Download PDF
                        </a>
                      )}
                      {excelLink && (
                        <a
                          className="underline text-primary"
                          href={apiBase + excelLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Download Excel
                        </a>
                      )}
                    </div>
                  )}

          {!!(resp as any).artifacts?.merchants?.length && (
                    <div className="pt-2">
                      <div className="text-sm font-medium">Top merchants</div>
                      <ul className="list-disc pl-5 text-sm opacity-90">
                        {(resp as any).artifacts.merchants.slice(0, 5).map((m: any, idx: number) => (
                          <li key={idx}>
              {m.merchant}: ${Math.round(Number(m.spend ?? m.amount ?? 0))}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

        {!!(resp as any).tool_trace?.length && (
                  <>
          <Sep />
                    <div className="text-sm font-medium">Tool trace</div>
                    <pre className="text-xs whitespace-pre-wrap leading-snug opacity-80">
                      {JSON.stringify((resp as any).tool_trace, null, 2)}
                    </pre>
                  </>
                )}
              </>
            )}

      <Sep />
            <div className="text-sm font-medium">Raw response</div>
            <pre className="text-xs whitespace-pre-wrap leading-snug opacity-80">
              {JSON.stringify(resp, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
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
    }
  }
  return res;
}
