import { useState } from "react";
import { downloadExcelReport, downloadPdfReport, type ExportFilters } from "@/lib/api";
import { saveAs } from "@/utils/download";
import { Download, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ExportKind = "excel-summary" | "excel-full" | "excel-unknowns" | "pdf-monthly";

type Props = {
  month: string; // "YYYY-MM" - required
  hasAnyTransactions: boolean;
  hasUnknowns: boolean;
  filters?: ExportFilters;
  className?: string;
};

const EXPORT_OPTIONS: {
  id: ExportKind;
  label: string;
  description: string;
  type: "excel" | "pdf";
  mode: "summary" | "full" | "unknowns";
}[] = [
  {
    id: "excel-summary",
    label: "Excel — Monthly summary",
    description: "One sheet with income, spend, net, and unknowns.",
    type: "excel",
    mode: "summary",
  },
  {
    id: "excel-full",
    label: "Excel — Full workbook",
    description: "Summary + categories + merchants + transactions.",
    type: "excel",
    mode: "full",
  },
  {
    id: "excel-unknowns",
    label: "Excel — Unknowns only",
    description: "Only uncategorized transactions for this month.",
    type: "excel",
    mode: "unknowns",
  },
  {
    id: "pdf-monthly",
    label: "PDF — Monthly report",
    description: "Ready-to-share monthly PDF report.",
    type: "pdf",
    mode: "full",
  },
];

export default function ExportMenu({
  month,
  hasAnyTransactions,
  hasUnknowns,
  filters,
  className,
}: Props) {
  const [loadingId, setLoadingId] = useState<ExportKind | null>(null);

  async function handleExport(option: (typeof EXPORT_OPTIONS)[number]) {
    if (loadingId) return;
    setLoadingId(option.id);

    try {
      if (option.type === "excel") {
        const { blob, filename } = await downloadExcelReport({
          month,
          mode: option.mode as "summary" | "full" | "unknowns",
          filters,
        });
        saveAs(blob, filename);
        toast.success(
          `Excel export started for ${month} (${option.mode}). Your browser should start downloading shortly.`
        );
      } else {
        const { blob, filename } = await downloadPdfReport({
          month,
          mode: option.mode as "summary" | "full",
        });
        saveAs(blob, filename);
        toast.success(
          `PDF export started for ${month}. Your browser should start downloading shortly.`
        );
      }
    } catch (err: any) {
      const status = err?.status;
      const message =
        status === 404
          ? `No data to export for ${month}. Try uploading a statement first.`
          : `Export failed (${status ?? "error"}). Please try again.`;
      console.error("Export failed", err);
      toast.error(message);
    } finally {
      setLoadingId(null);
    }
  }


  const canUseUnknowns = hasAnyTransactions && hasUnknowns;
  const canUseAnyExport = hasAnyTransactions;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="pill-outline"
          size="sm"
          className={cn("inline-flex items-center gap-1", className)}
          disabled={!canUseAnyExport || !!loadingId}
          data-testid="export-menu-trigger"
        >
          {loadingId ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-72"
        align="end"
        sideOffset={4}
        data-testid="export-menu"
      >
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Export for {month}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!canUseAnyExport ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            No data available for {month}. Upload a statement or choose a month
            with transactions to enable exports.
          </div>
        ) : (
          EXPORT_OPTIONS.map((opt) => {
            const isUnknowns = opt.id === "excel-unknowns";
            const disabled =
              loadingId === opt.id ||
              (isUnknowns && !canUseUnknowns) ||
              !!loadingId;

            const tooltip =
              !canUseAnyExport
                ? "No data for this month."
                : isUnknowns && !hasUnknowns
                ? "No uncategorized transactions for this month."
                : undefined;

            return (
              <DropdownMenuItem
                key={opt.id}
                disabled={disabled}
                className={cn(
                  "flex flex-col items-start gap-0.5 py-2 text-xs leading-snug",
                  disabled && "opacity-60"
                )}
                onSelect={(e) => {
                  e.preventDefault();
                  if (!disabled) {
                    void handleExport(opt);
                  }
                }}
                data-testid={`export-option-${opt.id}`}
              >
                <span className="font-medium">
                  {opt.label}
                  {tooltip && (
                    <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      ({tooltip})
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground">
                  {opt.description}
                </span>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
