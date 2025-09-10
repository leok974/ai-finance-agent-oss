import { useState } from "react";
import { downloadReportExcel, downloadReportPdf } from "@/lib/api";
import { saveAs } from "@/utils/download";
import { Download, Check } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import DateRangePicker from "@/components/DateRangePicker";

type Props = { month?: string };

export default function ExportMenu({ month }: Props) {
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [includeTxns, setIncludeTxns] = useState(true);
  const [splitAlpha, setSplitAlpha] = useState(false);
  const [range, setRange] = useState<{ start?: string; end?: string }>({});

  async function doExcel() {
    try {
      setBusy("excel");
  const { blob, filename } = await downloadReportExcel(month, includeTxns, { ...range, splitAlpha });
      saveAs(blob, filename);
    } finally {
      setBusy(null);
    }
  }

  async function doPdf() {
    try {
      setBusy("pdf");
      const { blob, filename } = await downloadReportPdf(month, range);
      saveAs(blob, filename);
    } finally {
      setBusy(null);
    }
  }


  const btn = (label: string, onClick: () => void, variant: "primary" | "secondary" = "primary") => (
    <button
      onClick={onClick}
      disabled={!!busy}
      className={
        variant === "primary"
          ? "px-3 py-1 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm"
          : "px-3 py-1 rounded-2xl bg-gray-700 hover:bg-gray-600 text-white text-sm"
      }
    >
      {label}
    </button>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={!!busy} className="rounded-2xl">
          <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
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
        <div className="px-2 py-1.5">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
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
  );
}
