import { useState } from "react";
import { downloadReportExcel, downloadReportPdf } from "@/lib/api";
import { saveAs } from "@/utils/download";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
      toast.success(`Exported ${month || 'report'} to Excel`);
    } catch (err: any) {
      console.error("Excel export failed", err);
      const message = err?.message || "Excel export failed";
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  async function doPdf() {
    try {
      setBusy("pdf");
      const { blob, filename } = await downloadReportPdf(month, range);
      saveAs(blob, filename);
      toast.success(`Exported ${month || 'report'} to PDF`);
    } catch (err: any) {
      console.error("PDF export failed", err);
      const message = err?.message || "PDF export failed";
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }


  return (
    <div className="flex items-center gap-2">
      {/* Export dropdown with improved visual clarity */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="pill"
            size="sm"
            disabled={!!busy}
            className="gap-2 px-3.5 h-9"
            aria-label={rangeActive ? `Export (range ${rangeLabel})` : "Export"}
            data-testid="export-menu-trigger"
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-[240px] rounded-2xl border border-border/60 bg-background/95 shadow-lg backdrop-blur"
        >
          {/* Settings section */}
          <div className="px-2 py-1.5">
            <p className="text-xs font-medium text-muted-foreground mb-2">Export Options</p>
            <DropdownMenuCheckboxItem
              checked={includeTxns}
              onCheckedChange={(v: boolean | "indeterminate") => setIncludeTxns(v === true)}
              className="text-sm"
            >
              Include transactions
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={splitAlpha}
              onCheckedChange={(v: boolean | "indeterminate") => setSplitAlpha(v === true)}
              className="text-sm"
            >
              Split transactions A–M / N–Z
            </DropdownMenuCheckboxItem>
          </div>

          <DropdownMenuSeparator />

          {/* Export actions with improved labels */}
          <div className="px-1 py-1">
            <DropdownMenuItem
              onClick={doExcel}
              disabled={busy === "excel"}
              className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer"
              data-testid="export-excel"
            >
              <div className="flex items-center gap-2 w-full">
                <FileSpreadsheet className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium">Excel (.xlsx)</span>
              </div>
              <span className="text-xs text-muted-foreground pl-6">
                {busy === "excel" ? "Exporting..." :
                 includeTxns ? `Full report for ${month || 'selected period'}` :
                 "Summary only"}
              </span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={doPdf}
              disabled={busy === "pdf"}
              className="flex flex-col items-start gap-0.5 py-2.5 cursor-pointer"
              data-testid="export-pdf"
            >
              <div className="flex items-center gap-2 w-full">
                <FileText className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium">PDF (.pdf)</span>
              </div>
              <span className="text-xs text-muted-foreground pl-6">
                {busy === "pdf" ? "Generating..." : "Summary view only"}
              </span>
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Range picker popover lives OUTSIDE the dropdown */}
      <DateRangePicker value={range} onChange={setRange} />
    </div>
  );
}
