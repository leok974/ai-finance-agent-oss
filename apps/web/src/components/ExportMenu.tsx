import { useState } from "react";
import { downloadExcelReport, downloadPdfReport, type ExportFilters } from "@/lib/api";
import { saveAs } from "@/utils/download";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
          type="button"
          size="sm"
          data-testid="export-menu-trigger"
          disabled={!canUseAnyExport || !!loadingId}
          className={cn(
            "h-8 rounded-full border-border/60 bg-surface-elevated/70 px-3 text-xs font-medium",
            "text-muted-foreground shadow-sm hover:bg-surface-elevated/90 hover:text-foreground",
            "flex items-center gap-1 border",
            className
          )}
        >
          {loadingId ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin opacity-70" aria-hidden="true" />
              <span>Exporting...</span>
            </>
          ) : (
            <>
              <span>Export</span>
              <ChevronDown className="h-3 w-3 opacity-70" aria-hidden="true" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="z-50 w-72 rounded-2xl border border-border/60 bg-popover/95 p-1 shadow-lg backdrop-blur"
      >
        <DropdownMenuLabel className="px-3 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">
          Export for {month}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {!canUseAnyExport ? (
          <div className="px-3 py-3 text-[11px] text-muted-foreground">
            No transactions yet for {month}. Add data to enable exports.
          </div>
        ) : (
          EXPORT_OPTIONS.map((opt) => {
            const isUnknowns = opt.id === "excel-unknowns";
            const disabled =
              loadingId === opt.id ||
              (isUnknowns && !canUseUnknowns) ||
              !!loadingId;

            return (
              <DropdownMenuItem
                key={opt.id}
                disabled={disabled}
                className={cn(
                  "flex flex-col items-start gap-0.5 px-3 py-2 text-xs leading-snug",
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
                <span className="font-medium text-foreground">{opt.label}</span>
                <span className="text-[11px] text-muted-foreground">
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
