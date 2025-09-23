import { useState } from "react";
import { downloadReportExcel, downloadReportPdf } from "@/lib/api";
import { saveAs } from "@/utils/download";
import { Download, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
// Optional toast helper (if you have one). Otherwise we fallback to alert().
// import { toastError } from "@/src/lib/toast-helpers";
import DateRangePicker from "@/components/DateRangePicker";

type Props = { month?: string };

export default function ExportMenu({ month }: Props) {
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [includeTxns, setIncludeTxns] = useState(true);
  const [splitAlpha, setSplitAlpha] = useState(false);
  const [range, setRange] = useState<{ start?: string; end?: string }>({});
  const rangeActive = !!(range.start && range.end);
  const rangeLabel = rangeActive ? `${range.start} → ${range.end}` : null;

  async function doExcel() {
    try {
      setBusy("excel");
      const { blob, filename } = await downloadReportExcel(month, includeTxns, { ...range, splitAlpha });
      saveAs(blob, filename);
    } catch (err: any) {
      console.error("Excel export failed", err);
      (window as any)?.toastError?.("Excel export failed") ?? alert("Excel export failed. Check console/logs.");
    } finally {
      setBusy(null);
    }
  }

  async function doPdf() {
    try {
      setBusy("pdf");
      const { blob, filename } = await downloadReportPdf(month, range);
      saveAs(blob, filename);
    } catch (err: any) {
      console.error("PDF export failed", err);
      (window as any)?.toastError?.("PDF export failed") ?? alert("PDF export failed. Check console/logs.");
    } finally {
      setBusy(null);
    }
  }


  return (
    <div className="flex items-center gap-2">
      {/* Export dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="pill"
            size="sm"
            disabled={!!busy}
            className="gap-2 px-3.5 h-9"
            aria-label={rangeActive ? `Export (range ${rangeLabel})` : "Export"}
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[240px]">
        <DropdownMenuCheckboxItem
          checked={includeTxns}
          onCheckedChange={(v: boolean | "indeterminate") => setIncludeTxns(v === true)}
        >
          Include transactions
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={splitAlpha}
          onCheckedChange={(v: boolean | "indeterminate") => setSplitAlpha(v === true)}
        >
          Split transactions A–M / N–Z
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={doExcel} disabled={busy === "excel"}>
          {busy === "excel" ? <Check className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={doPdf} disabled={busy === "pdf"}>
          {busy === "pdf" ? <Check className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
          PDF (.pdf)
        </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Range picker popover lives OUTSIDE the dropdown */}
      <DateRangePicker value={range} onChange={setRange} />
    </div>
  );
}
