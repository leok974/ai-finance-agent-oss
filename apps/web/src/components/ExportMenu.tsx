import { useState } from "react";
import { downloadReportExcel, downloadReportPdf, type ExportMode } from "@/lib/api";
import { saveAs } from "@/utils/download";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import DateRangePicker from "@/components/DateRangePicker";

type Props = { month?: string; hasUnknowns?: boolean };

export default function ExportMenu({ month, hasUnknowns = true }: Props) {
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [splitAlpha, setSplitAlpha] = useState(false);
  const [range, setRange] = useState<{ start?: string; end?: string }>({});
  const rangeActive = !!(range.start && range.end);

  async function handleExcelExport(mode: ExportMode) {
    try {
      setBusy("excel");
      const { blob, filename } = await downloadReportExcel(month, mode, { ...range, splitAlpha });
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

  async function handlePdfExport(mode: 'full' | 'summary' = 'summary') {
    try {
      setBusy("pdf");
      const { blob, filename } = await downloadReportPdf(month, mode, range);
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
      {/* Export dropdown with preset modes */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="pill"
            size="sm"
            disabled={!!busy}
            className="gap-2 px-3.5 h-9"
            aria-label="Export"
            data-testid="export-menu-trigger"
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-[260px] rounded-2xl border border-border/60 bg-background/95 shadow-lg backdrop-blur"
        >
          {/* Excel presets */}
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            Excel
          </DropdownMenuLabel>
          <div className="px-1 py-1">
            <DropdownMenuItem
              onClick={() => handleExcelExport('summary')}
              disabled={busy === "excel"}
              className="flex items-start gap-2 py-2.5 cursor-pointer"
              data-testid="export-excel-summary"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Summary only</span>
                <span className="text-xs text-muted-foreground">
                  1 sheet, good for sharing
                </span>
              </div>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => handleExcelExport('full')}
              disabled={busy === "excel"}
              className="flex items-start gap-2 py-2.5 cursor-pointer"
              data-testid="export-excel-full"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Full details</span>
                <span className="text-xs text-muted-foreground">
                  Includes all transactions
                </span>
              </div>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => handleExcelExport('unknowns')}
              disabled={busy === "excel" || !hasUnknowns}
              className="flex items-start gap-2 py-2.5 cursor-pointer"
              data-testid="export-excel-unknowns"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Unknowns only</span>
                <span className="text-xs text-muted-foreground">
                  Uncategorised transactions
                </span>
              </div>
            </DropdownMenuItem>
          </div>

          <DropdownMenuSeparator />

          {/* PDF presets */}
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
            PDF
          </DropdownMenuLabel>
          <div className="px-1 py-1">
            <DropdownMenuItem
              onClick={() => handlePdfExport('summary')}
              disabled={busy === "pdf"}
              className="flex items-start gap-2 py-2.5 cursor-pointer"
              data-testid="export-pdf-summary"
            >
              <FileText className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Summary PDF</span>
                <span className="text-xs text-muted-foreground">
                  Summary view only
                </span>
              </div>
            </DropdownMenuItem>
          </div>

          <DropdownMenuSeparator />

          {/* Export options */}
          <div className="px-2 py-1.5">
            <p className="text-xs font-medium text-muted-foreground mb-2">Options</p>
            <DropdownMenuCheckboxItem
              checked={splitAlpha}
              onCheckedChange={(v: boolean | "indeterminate") => setSplitAlpha(v === true)}
              className="text-sm"
            >
              Split transactions A–M / N–Z
            </DropdownMenuCheckboxItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Range picker popover lives OUTSIDE the dropdown */}
      <DateRangePicker value={range} onChange={setRange} />
    </div>
  );
}
