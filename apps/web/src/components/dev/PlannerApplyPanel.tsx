import React, { useCallback, useState } from "react";
import { agentPlanPreview, agentPlanApply, downloadReportExcel, type PlannerPlanItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { emitToastSuccess, emitToastError } from "@/lib/toast-helpers";

export default function PlannerApplyPanel() {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<any | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const ok = emitToastSuccess; const err = emitToastError;

  const preview = useCallback(async () => {
    setLoading(true);
    try {
  const p = await agentPlanPreview({ month: null });
      setPlan(p);
      setSelected({});
    } catch (e: any) {
  err(e?.message || "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [err]);

  const apply = useCallback(async () => {
    if (!plan || applying) return;
    const picked: PlannerPlanItem[] = [];
    (plan.items || []).forEach((it: any, idx: number) => {
      if (selected[idx]) picked.push(it as any);
    });
    const wantsExport = picked.some((a) => a.kind === "export_report");
    const actions: PlannerPlanItem[] = picked; // backend no-ops export_report, safe to send
    setLoading(true);
    setApplying(true);
    try {
  const res: any = await agentPlanApply({ month: plan?.month ?? null, actions });
  ok("Applied.");
      if (wantsExport) {
        await handleApplyLocal({ res, month: plan?.month, selected: actions as any });
      }
    } catch (e: any) {
  err(e?.message || "Apply failed");
    } finally {
      setLoading(false);
      setApplying(false);
    }
  }, [plan, selected, applying, ok, err]);

  const download = useCallback(async (m?: string) => {
    try {
      const { blob, filename } = await downloadReportExcel(m, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
  err(e?.message || "Download failed");
    }
  }, [err]);

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Button onClick={preview} disabled={loading}>{loading ? "Loading…" : "Preview Plan"}</Button>
        <Button onClick={apply} variant="secondary" disabled={!plan || loading || applying}>
          {applying ? "Applying…" : "Apply Selected"}
        </Button>
      </div>
      {plan && (
        <div className="text-sm opacity-80">Month: <b>{plan.month}</b></div>
      )}
      {plan && (
        <ul className="space-y-2">
          {plan.items.map((it: any, idx: number) => (
            <li key={idx} className="flex items-start gap-2">
              <input type="checkbox" id={`plan-${idx}`} checked={!!selected[idx]} onChange={(e) => setSelected(s => ({ ...s, [idx]: e.target.checked }))} />
              <label htmlFor={`plan-${idx}`} className="cursor-pointer ml-2">
                <div className="font-medium">{it.title}</div>
                <div className="text-xs opacity-70">{it.kind}</div>
                {it.kind === "export_report" && (
                  <div className="pt-1">
                    <Button variant="ghost" className="px-0 underline" onClick={() => download((it as any).month)}>Download Excel</Button>
                  </div>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Local, file-scoped helper to avoid HMR export-shape changes
async function handleApplyLocal(args: {
  res: any;
  month?: string;
  selected: PlannerPlanItem[];
}) {
  const { res, month, selected } = args;
  const wantsExport = (selected || []).some((a) => a.kind === "export_report");
  const reportUrl: string | undefined = (res as any)?.report_url;
  if (!wantsExport) return res;
  if (reportUrl) {
    window.location.href = reportUrl;
  } else if (month) {
    await downloadReportExcel(month, true, { splitAlpha: true });
  } else {
    console.warn("[PlannerApplyPanel] export_report requested but no month resolved and no report_url from backend.");
  }
  return res;
}
