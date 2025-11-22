import { useState } from "react";
import { downloadReportExcel, downloadReportPdf, type ExportMode } from "@/lib/api";
import { saveAs } from "@/utils/download";
import { Download, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type ExportKind = "excel-summary" | "excel-full" | "excel-unknowns" | "pdf-summary" | "pdf-full";

type Props = {
  month?: string;
  hasAnyTransactions?: boolean;
  hasUnknowns?: boolean;
  filters?: {
    category?: string | null;
    minAmount?: number | null;
    maxAmount?: number | null;
    search?: string | null;
  };
  className?: string;
};

const EXPORT_OPTIONS: {
  id: ExportKind;
  label: string;
  description: string;
  type: "excel" | "pdf";
  mode: ExportMode | "full" | "summary";
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
    id: "pdf-summary",
    label: "PDF — Summary report",
    description: "Summary metrics and top categories/merchants.",
    type: "pdf",
    mode: "summary",
  },
  {
    id: "pdf-full",
    label: "PDF — Full report",
    description: "Summary + unknowns section with details.",
    type: "pdf",
    mode: "full",
  },
];

export default function ExportMenu({
  month,
  hasAnyTransactions = true,
  hasUnknowns = false,
  filters,
  className,
}: Props) {
  const [loadingId, setLoadingId] = useState<ExportKind | null>(null);

  async function handleExport(option: (typeof EXPORT_OPTIONS)[number]) {
    if (loadingId) return;
    setLoadingId(option.id);

    try {
      if (option.type === "excel") {
        const { blob, filename } = await downloadReportExcel(month, option.mode as ExportMode);
        saveAs(blob, filename);
        toast.success(
          `Excel export started for ${month || "report"} (${option.mode}). Your browser should start downloading shortly.`
        );
      } else {
        const { blob, filename } = await downloadReportPdf(month, option.mode as "full" | "summary");
        saveAs(blob, filename);
        toast.success(
          `PDF export started for ${month || "report"}. Your browser should start downloading shortly.`
        );
      }
    } catch (err: any) {
      const message =
        err?.message?.includes("404") || err?.message?.includes("No data")
          ? `No data to export for ${month || "this period"}. Try uploading a statement first.`
          : `Export failed. ${err?.message || "Please try again."}`;
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
          className={cn("inline-flex items-center gap-1.5", className)}
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
          Export for {month || "current period"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!canUseAnyExport ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            No data available for {month || "this period"}. Upload a statement or choose a month
            with transactions to enable exports.
          </div>
        ) : (
          EXPORT_OPTIONS.map((opt) => {
            const isUnknowns = opt.id === "excel-unknowns";
            const disabled =
              loadingId === opt.id ||
              (isUnknowns && !canUseUnknowns) ||
              !!loadingId;

            const disabledReason =
              !canUseAnyExport
                ? "No data for this month"
                : isUnknowns && !hasUnknowns
                ? "No uncategorized transactions"
                : undefined;

            return (
              <DropdownMenuItem
                key={opt.id}
                disabled={disabled}
                className={cn(
                  "flex flex-col items-start gap-0.5 py-2.5 px-2 text-xs leading-snug cursor-pointer",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
                onSelect={(e) => {
                  e.preventDefault();
                  if (!disabled) {
                    void handleExport(opt);
                  }
                }}
                data-testid={`export-option-${opt.id}`}
              >
                <span className="font-medium text-sm">
                  {opt.label}
                  {disabledReason && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground font-normal">
                      ({disabledReason})
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground">{opt.description}</span>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
