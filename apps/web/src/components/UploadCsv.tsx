import React, { useCallback, useRef, useState } from "react";
import {
  uploadCsv,
  fetchLatestMonth,
  deleteAllTransactions,
  agentTools,
  chartsSummary,
  chartsMerchants,
  chartsCategories,
  chartsFlows
} from "../lib/api"; // uses your existing helpers
import { emitToastSuccess, emitToastError } from "@/lib/toast-helpers";
import { t } from '@/lib/i18n';
import { useMonth } from "../context/MonthContext";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

type UploadResult = {
  ok: boolean;
  status?: number;
  message?: string;
  data?: any;
};

type IngestResult = {
  ok: boolean;
  added: number;
  count: number;
  duplicates?: number;
  detected_month?: string | null;
  date_range?: {
    earliest?: string | null;
    latest?: string | null;
  };
  error?: string | null;
  message?: string | null;
};

function buildIngestSummary(result: IngestResult): string {
  if (!result.ok) {
    // Fallback to backend message for errors
    return result.message || 'CSV ingest failed. Please check the file format and try again.';
  }

  const { added, count, duplicates = 0, detected_month, date_range } = result;

  const monthLabel = detected_month ?? 'this period';

  // No rows at all
  if (count === 0) {
    return 'CSV uploaded, but no data rows were found.';
  }

  // All rows were duplicates
  if (added === 0 && duplicates > 0) {
    return `No new transactions to add. All ${count} row${count === 1 ? '' : 's'} in this file already exist in your ledger for ${monthLabel}.`;
  }

  // Normal success case
  let msg = `CSV ingested successfully. ${added} new transaction${added === 1 ? '' : 's'} added for ${monthLabel}.`;

  if (duplicates > 0) {
    msg += ` ${duplicates} duplicate entr${duplicates === 1 ? 'y was' : 'ies were'} skipped.`;
  }

  if (date_range?.earliest && date_range?.latest) {
    msg += ` Date range: ${date_range.earliest} → ${date_range.latest}.`;
  }

  return msg;
}

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

  const reset = useCallback(async () => {
    try {
      setBusy(true);
      // Delete all transactions from the database
      await deleteAllTransactions();
      // Clear UI state
      setFile(null);
      setResult(null);
      if (inputRef.current) inputRef.current.value = "";
      emitToastSuccess(t('ui.toast.data_cleared_title'), { description: t('ui.toast.data_cleared_description') });
      // Trigger parent refresh (e.g., dashboard)
      onUploaded?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      emitToastError(t('ui.toast.reset_failed_title'), { description: msg });
    } finally {
      setBusy(false);
    }
  }, [onUploaded]);

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

      // Check if backend indicated failure (ok: false or added === 0)
      const responseOk = (data as { ok?: boolean; added?: number; message?: string; error?: string }).ok;
      const added = (data as { added?: number }).added ?? 0;
      const backendMessage = (data as { message?: string }).message;
      const errorType = (data as { error?: string }).error;

      if (responseOk === false || added === 0) {
        // Backend reported an error (empty file, no rows parsed, etc.)
        let errorMsg = "No transactions were imported.";
        if (backendMessage) {
          errorMsg = backendMessage;
        } else if (errorType === "empty_file") {
          errorMsg = "CSV file is empty or contains only headers.";
        } else if (errorType === "no_rows_parsed") {
          errorMsg = "File contained rows but no valid transactions could be parsed. Check CSV format.";
        }

        const r: UploadResult = { ok: false, data, message: errorMsg };
        setResult(r);
        onUploaded?.(r);
        // Show error toast instead of success
        emitToastError("Import Failed", { description: errorMsg });
        return;
      }

      // Success case: at least one row was added
      const r: UploadResult = { ok: true, data, message: `CSV ingested successfully. ${added} transaction${added !== 1 ? 's' : ''} added.` };
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
      emitToastError("Upload Failed", { description: message });
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

        {/* Supported CSV Formats Documentation */}
        <div className="mt-4 text-xs text-slate-300 border border-slate-700/60 rounded-lg p-3 bg-slate-900/40">
          <div className="font-medium text-slate-100 mb-2">Supported CSV formats</div>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <span className="font-semibold">LedgerMind CSV</span>
              <div className="ml-5 mt-1 text-slate-400">
                Columns: <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">date</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">merchant</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">description</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">amount</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">category</code>
              </div>
            </li>
            <li>
              <span className="font-semibold">Bank Export v1</span>
              <div className="ml-5 mt-1 text-slate-400">
                Columns: <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Date</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Description</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Comments</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Check Number</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Amount</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Balance</code>
              </div>
            </li>
            <li>
              <span className="font-semibold">Bank Debit/Credit</span>
              <div className="ml-5 mt-1 text-slate-400">
                Columns: <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Date</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Description</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Debit</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Credit</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Balance</code>
              </div>
            </li>
            <li>
              <span className="font-semibold">Bank Posted/Effective</span>
              <div className="ml-5 mt-1 text-slate-400">
                Columns: <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Posted Date</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Effective Date</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Description</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Amount</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Type</code>,{" "}
                <code className="text-xs bg-slate-800 px-1 py-0.5 rounded">Balance</code>
              </div>
            </li>
          </ul>
          <div className="mt-2 text-slate-400 italic">
            CSV headers are case-insensitive. Format is auto-detected from column names.
          </div>
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

        {result && result.ok && (
          <div className="mt-4 rounded-xl border border-emerald-700/70 bg-emerald-950/40 p-4 text-emerald-50 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-semibold">
                ✓
              </span>
              <span className="font-semibold">Success</span>
            </div>

            <p data-testid="csv-ingest-summary" className="text-emerald-100/90">
              {buildIngestSummary(result.data as IngestResult)}
            </p>

            <details className="mt-2 text-xs text-emerald-100/70">
              <summary className="cursor-pointer select-none underline underline-offset-2">
                View technical details
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all rounded-md bg-emerald-950/60 p-2">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {result && !result.ok && (
          <div className="mt-4 rounded-xl border border-rose-700 bg-rose-900/30 p-4 text-rose-200 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/20 text-[11px] font-semibold">
                ✕
              </span>
              <span className="font-semibold">
                Error{result.status ? ` (${result.status})` : ""}
              </span>
            </div>

            <p data-testid="csv-ingest-error" className="text-rose-100/90">
              {result.message || "Upload failed. Please check the file and try again."}
            </p>

            {result.data && (
              <details className="mt-2 text-xs text-rose-100/70">
                <summary className="cursor-pointer select-none underline underline-offset-2">
                  View technical details
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-all rounded-md bg-rose-950/60 p-2">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
  {/* hint removed per request */}
    </div>
  );
};

export default UploadCsv;
