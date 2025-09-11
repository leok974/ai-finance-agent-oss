import { downloadReportExcel } from "./api";

export type PlannerAction = { kind: string; [k: string]: any };

export async function handleApply({
  res,
  month,
  selected,
}: {
  res: any;
  month?: string;
  selected: PlannerAction[];
}): Promise<any> {
  const wantsExport = (selected || []).some((a) => a?.kind === "export_report");
  if (!wantsExport) return;

  const reportUrl: string | undefined = (res as any)?.report_url;
  if (reportUrl) {
    // Single source of truth if backend provided it
    (window as any).location.href = reportUrl;
    return res;
  }
  if (month) {
    await downloadReportExcel(month, true, { splitAlpha: true });
  }
  return res;
}
