import { useState } from "react";
import { downloadReportExcel, downloadReportPdf } from "@/lib/api";
import { saveAs } from "@/utils/save";

type Props = { month?: string };

export default function ExportMenu({ month }: Props) {
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);

  async function doExcel() {
    try {
      setBusy("excel");
      const { blob, filename } = await downloadReportExcel(month);
      saveAs(blob, filename);
    } finally {
      setBusy(null);
    }
  }

  async function doPdf() {
    try {
      setBusy("pdf");
      const { blob, filename } = await downloadReportPdf(month);
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
    <div className="flex items-center gap-2">
      {btn("Excel", doExcel, "primary")}
      {btn("PDF", doPdf, "secondary")}
    </div>
  );
}
