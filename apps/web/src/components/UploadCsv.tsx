import React, { useCallback, useRef, useState } from "react";
import {
  uploadCsv,
  fetchLatestMonth,
  agentTools,
  chartsSummary,
  chartsMerchants,
  chartsCategories,
  chartsFlows
} from "../lib/api"; // uses your existing helpers
import { emitToastSuccess, emitToastError } from "@/lib/toast-helpers";
import { t } from '@/lib/i18n';
import { ToastAction } from "@/components/ui/toast";
import { scrollToId } from "@/lib/scroll";
import { useMonth } from "../context/MonthContext";
import Card from "./Card";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

type UploadResult = {
  ok: boolean;
  status?: number;
  message?: string;
  data?: any;
};

interface UploadCsvProps {
  /** Called after a successful upload. Useful to refresh Unknowns/Suggestions. */
  onUploaded?: (result?: UploadResult) => void;
  /** Default for the "Replace existing data" toggle. */
  defaultReplace?: boolean;
  /** Optional className passthrough. */
  className?: string;
}

const prettyBytes = (n: number) => {
  if (!Number.isFinite(n)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u++;
  }
  return `${n.toFixed(u === 0 ? 0 : 1)} ${units[u]}`;
};

const UploadCsv: React.FC<UploadCsvProps> = ({ onUploaded, defaultReplace = true, className }) => {
  const { month, setMonth } = useMonth();
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState<boolean>(defaultReplace);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // useToast replaced with emit helpers

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setResult(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0] ?? null;
    setFile(f);
    setResult(null);
  }, []);

  const onDrag = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragover") setDragOver(true);
    if (e.type === "dragleave") setDragOver(false);
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  // After a successful upload, snap to latest month and refetch key dashboards
  const handleUploadSuccess = useCallback(async (uploadData?: Record<string, unknown>) => {
    try {
      // Prefer detected_month from upload response over fetchLatestMonth call
      const detectedMonth = uploadData?.detected_month as string | undefined;
      const latest = detectedMonth || await fetchLatestMonth();

      // Only update month if we got a meaningful result that's different from current
      if (latest && latest !== month && latest.length >= 7) {
        // Update to detected month from CSV
        setMonth(latest);
      }

      // Use the resolved month (prefer detected over current context month)
      const resolved = detectedMonth || month || latest;
      if (resolved) {
        // Fire-and-forget to avoid blocking UI
        // Use new normalized chart functions for consistent data shape
        void Promise.allSettled([
          chartsSummary(resolved),
          chartsMerchants(resolved, 10),
          chartsCategories(resolved, 10),
          chartsFlows(resolved),
          agentTools.chartsSpendingTrends({ month: resolved, months_back: 6 }),
          agentTools.suggestionsWithMeta({ month: resolved, window_months: 3, min_support: 3, min_share: 0.6, limit: 10 }),
        ]);
      }
    } catch {
      // best-effort; UI will still refresh via parent onUploaded handler
    }
  }, [month, setMonth]);

  const doUpload = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      // Uses your existing API helper; falls back to direct fetch if needed.
      const data = await uploadCsv(file, replace); // Auto-inference enabled
      const r: UploadResult = { ok: true, data, message: "CSV ingested successfully." };
      setResult(r);
      onUploaded?.(r);
      // snap month + refetch dashboards (non-blocking), pass the upload data
      void handleUploadSuccess(data as Record<string, unknown>);
      // Success toast with dual CTAs
      emitToastSuccess(t('ui.toast.import_complete_title'), { description: t('ui.toast.import_complete_description') });
      // optional: reset file after success
      // reset();
    } catch (err: unknown) {
      const message =
        (err as Error)?.message ??
        (typeof err === "string" ? err : "Upload failed. Check server logs for details.");
      const status = (err as { status?: number })?.status ?? undefined;
      const r: UploadResult = { ok: false, status, message };
      setResult(r);
    } finally {
      setBusy(false);
    }
  }, [file, replace, onUploaded, handleUploadSuccess]);  const disabled = busy || !file;

  return (
    <div className={`w-full ${className ?? ""}`}>
        <header className="flex items-center justify-between border-b border-border pb-1">
          <h2 className="text-lg font-semibold">Upload Transactions CSV</h2>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              Replace existing data
            </label>
            <Button
              onClick={reset}
              type="button"
              variant="pill-outline"
              size="sm"
            >
              Reset
            </Button>
          </div>
        </header>

        <label
          onDragOver={onDrag}
          onDragLeave={onDrag}
          onDrop={onDrop}
          className={`mt-4 block cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition
            ${dragOver ? "border-indigo-400 bg-indigo-500/10" : "border-border hover:bg-background/40"}`}
        >
          <input
            data-testid="uploadcsv-input"
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onPick}
          />
          <div className="space-y-2">
            <div className="text-sm font-medium">
              {file ? (
                <>
                  Selected: <span className="text-indigo-300">{file.name}</span>{" "}
                  <span className="opacity-70">({prettyBytes(file.size)})</span>
                </>
              ) : dragOver ? (
                "Drop your CSV to upload"
              ) : (
                "Click to choose a CSV or drag & drop here"
              )}
            </div>
            {!file && (
              <p className="text-xs opacity-70">
                Accepts <code>.csv</code> • Example: <code>transactions_sample.csv</code>
              </p>
            )}
          </div>
        </label>

        <div className="mt-4 flex items-center justify-end">
          <Button
            data-testid="uploadcsv-submit"
            variant="pill"
            onClick={doUpload}
            disabled={disabled}
            className="gap-2 px-3.5 h-9"
          >
            <Upload className="h-4 w-4" />
            {busy ? "Uploading…" : "Upload CSV"}
          </Button>
        </div>

        {/* Progress / Result */}
        {busy && (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
              <div className="h-2 w-2/3 animate-pulse rounded-full bg-indigo-500"></div>
            </div>
            <p className="mt-2 text-xs text-gray-400">Sending file to server…</p>
          </div>
        )}

        {result && (
          <div
            className={`mt-4 rounded-xl border p-3 text-sm ${
              result.ok
                ? "border-emerald-700 bg-emerald-900/30 text-emerald-200"
                : "border-rose-700 bg-rose-900/30 text-rose-200"
            }`}
          >
            <div className="font-medium">
              {result.ok ? "Success" : `Error${result.status ? ` (${result.status})` : ""}`}
            </div>
            {result.message && <div className="mt-1 opacity-90">{result.message}</div>}
            {result.data && (
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/30 p-2 text-xs">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            )}
          </div>
        )}
  {/* hint removed per request */}
    </div>
  );
};

export default UploadCsv;
