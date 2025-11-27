import React, { useCallback, useRef, useState } from "react";
import {
  uploadCsv,
  fetchLatestMonth,
  deleteAllTransactions,
  seedDemoData,
  agentTools,
  chartsSummary,
  chartsMerchants,
  chartsCategories,
  chartsFlows
} from "../lib/api"; // uses your existing helpers
import { fetchJSON } from "@/lib/http";
import { emitToastSuccess, emitToastError } from "@/lib/toast-helpers";
import { t } from '@/lib/i18n';
import { useMonth } from "../context/MonthContext";
import { useDemoMode } from "@/context/DemoModeContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Upload, Sparkles } from "lucide-react";
import { isExcelFile, normalizeExcelToCsvFile } from "../lib/excel";
import { toast } from "sonner";

// Max file size: 50MB (configurable for future)
const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

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
  } | null;
  error?: string | null;
  message?: string | null;
  headers_found?: string[]; // from backend for unknown_format
};

function buildFriendlyMessage(result: IngestResult): string {
  // Success branch
  if (result.ok) {
    const { added, count, duplicates = 0, detected_month, date_range } = result;
    const monthLabel = detected_month ?? 'this period';

    if (count === 0) {
      return 'CSV uploaded, but no data rows were found.';
    }

    if (added === 0 && duplicates > 0) {
      return `No new transactions were added. All ${count} row${count === 1 ? '' : 's'} in this file already exist in your ledger for ${monthLabel}.`;
    }

    let msg = `CSV ingested successfully. ${added} new transaction${added === 1 ? '' : 's'} added for ${monthLabel}.`;

    if (duplicates > 0) {
      msg += ` ${duplicates} duplicate entr${duplicates === 1 ? 'y was' : 'ies were'} skipped.`;
    }

    if (date_range?.earliest && date_range?.latest) {
      msg += ` Date range: ${date_range.earliest} → ${date_range.latest}.`;
    }

    return msg;
  }

  // Error branch
  switch (result.error) {
    case 'unknown_format': {
      const headers = result.headers_found ?? [];
      const headerList =
        headers.length > 0 ? headers.join(', ') : 'no headers were detected';

      return `We couldn't recognize this CSV format. We detected these column headers: ${headerList}. Please export a statement using one of the supported formats listed above or adjust your CSV headers to match.`;
    }

    case 'no_rows_parsed': {
      return result.message
        ?? 'We read this CSV but none of the rows could be converted into valid transactions. Check that dates and amounts are in a supported format.';
    }

    case 'all_rows_duplicate':
    case 'duplicate_constraint': {
      return result.message
        ?? 'No new transactions were added because all rows in this file already exist in your ledger. Try "Replace existing data" if you want this file to become the source of truth for that period.';
    }

    default:
      // Fallback: keep backend message but shorter context
      return result.message
        ?? 'Something went wrong while processing this CSV. Please try again or adjust the file format.';
  }
}

function IngestResultCard({ result }: { result: IngestResult }) {
  const [showJson, setShowJson] = useState(false);

  const variant = result.ok ? 'success' : 'error';
  const title = result.ok ? 'Success' : 'Error';
  const message = buildFriendlyMessage(result);

  const baseClasses = 'mt-4 rounded-xl border p-4 text-sm';
  const variantClasses =
    variant === 'success'
      ? 'border-emerald-700/70 bg-emerald-950/40 text-emerald-50'
      : 'border-rose-700/70 bg-rose-950/40 text-rose-50';

  return (
    <div className={`${baseClasses} ${variantClasses}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold">
          {variant === 'success' ? '✓' : '!'}
        </span>
        <span className="font-semibold">{title}</span>
      </div>

      <p
        data-testid="csv-ingest-message"
        className="text-[13px] leading-relaxed"
      >
        {message}
      </p>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-200/80">
        <Checkbox
          id="csv-show-json"
          checked={showJson}
          onCheckedChange={(v) => setShowJson(!!v)}
          data-testid="csv-ingest-toggle-json"
        />
        <Label htmlFor="csv-show-json" className="cursor-pointer select-none">
          Show raw JSON response
        </Label>
      </div>

      {showJson && (
        <pre
          className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/40 p-2 text-[11px]"
          data-testid="csv-ingest-json"
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
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
  const { enableDemo, disableDemo, disableDemoAsync, demoMode } = useDemoMode();
  const [file, setFile] = useState<File | null>(null);
  const [replace, setReplace] = useState<boolean>(defaultReplace);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // useToast replaced with emit helpers

  const onPick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;

    // Validate file size before setting
    if (f && f.size > MAX_FILE_SIZE_BYTES) {
      emitToastError("File Too Large", {
        description: `Maximum file size is ${MAX_FILE_SIZE_MB}MB. Your file is ${prettyBytes(f.size)}. Try splitting your data into smaller periods or contact support for help.`
      });
      // Clear the input so user can pick another file
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setFile(f);
    setResult(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0] ?? null;

    // Validate file size before setting
    if (f && f.size > MAX_FILE_SIZE_BYTES) {
      emitToastError("File Too Large", {
        description: `Maximum file size is ${MAX_FILE_SIZE_MB}MB. Your file is ${prettyBytes(f.size)}. Try splitting your data into smaller periods or contact support for help.`
      });
      return;
    }

    setFile(f);
    setResult(null);
  }, []);

  const onDrag = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragover") setDragOver(true);
    if (e.type === "dragleave") setDragOver(false);
  }, []);

  // Shared helper: trigger dashboard refresh with consistent delay
  const triggerRefresh = useCallback(() => {
    // Small delay to ensure backend commits changes before triggering refresh
    setTimeout(() => {
      onUploaded?.();
    }, 300);
  }, [onUploaded]);

  // CRITICAL RESET FLOW - DO NOT SIMPLIFY WITHOUT REGRESSION TESTS
  //
  // Demo mode rules:
  // - Demo data lives in DEMO_USER_ID (separate from real users)
  // - When lm:demoMode==="1", http.ts adds ?demo=1 (GET) or demo:true (POST body)
  // - This makes backend return DEMO_USER_ID data instead of current user
  //
  // Reset must:
  // 1. Clear demo data FIRST (even if not in demo mode - prevents stale data)
  // 2. Exit demo mode using disableDemoAsync() (waits for state to fully update)
  // 3. Clear current user data (now guaranteed http.ts won't append ?demo=1)
  //
  // We no longer use setTimeout - disableDemoAsync() returns a Promise that resolves
  // when demoMode state and localStorage are fully synchronized. This eliminates
  // race conditions where http.ts might still think we're in demo mode.
  //
  // See tests/UploadCsv.reset.test.tsx for regression coverage.
  const reset = useCallback(async () => {
    console.log('[UploadCsv] Reset starting - demoMode:', demoMode);
    try {
      setBusy(true);

      // Step 1: ALWAYS clear demo data first (in case it exists from previous demo seed)
      // This prevents demo data from reappearing after reset
      console.log('[UploadCsv] Clearing demo data first');
      try {
        await fetchJSON('demo/reset', { method: 'POST' });
      } catch (e) {
        console.warn('[UploadCsv] Demo reset failed (may not exist):', e);
      }

      // Step 2: Exit demo mode and wait for state to fully update
      // disableDemoAsync() returns a Promise that resolves when:
      // - React state (demoMode) is false
      // - localStorage (lm:demoMode) is removed
      // This ensures http.ts will NOT append ?demo=1 to the next API call
      if (demoMode) {
        console.log('[UploadCsv] Exiting demo mode (async)');
        await disableDemoAsync();
        console.log('[UploadCsv] Demo mode fully disabled');
      }

      // Step 3: Clear current user's data
      // Now guaranteed to query current user, not DEMO_USER_ID
      console.log('[UploadCsv] Calling reset endpoint (current user)');
      await fetchJSON('ingest/dashboard/reset', { method: 'POST' });

      console.log('[UploadCsv] Reset successful, triggering refresh');
      // Clear UI state
      setFile(null);
      setResult(null);
      if (inputRef.current) inputRef.current.value = "";
      emitToastSuccess(t('ui.toast.data_cleared_title'), { description: t('ui.toast.data_cleared_description') });
      // Trigger parent refresh (e.g., dashboard)
      triggerRefresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      emitToastError(t('ui.toast.reset_failed_title'), { description: msg });
    } finally {
      setBusy(false);
    }
  }, [demoMode, disableDemoAsync, triggerRefresh]);

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
        // Refetch all key dashboard data: charts
        void Promise.allSettled([
          chartsSummary(resolved),
          chartsMerchants(resolved, 10),
          chartsCategories(resolved, 10),
          chartsFlows(resolved),
          agentTools.chartsSpendingTrends({ month: resolved, months_back: 6 }),
          // Note: /agent/tools/suggestions was deprecated - ML feedback system replaced it
        ]);
      }
    } catch {
      // best-effort; UI will still refresh via parent onUploaded handler
    }
  }, [month, setMonth]);

  const doUpload = useCallback(async () => {
    if (!file) return;

    // CRITICAL: Prevent CSV upload while in demo mode - exit demo mode first
    // This ensures uploaded data goes to current user, not DEMO_USER_ID
    // Without this, http.ts would add demo:true to the upload request body
    if (demoMode) {
      console.log('[UploadCsv] Exiting demo mode before CSV upload');
      await disableDemoAsync();
      console.log('[UploadCsv] Demo mode fully disabled, proceeding with upload');
    }

    setBusy(true);
    setResult(null);
    try {
      let uploadFile = file;

      // Detect original format for metrics tracking
      const originalFormat = isExcelFile(file)
        ? (file.name.toLowerCase().endsWith('.xls') ? 'xls' : 'xlsx')
        : 'csv';

      // Convert Excel to CSV if needed
      if (isExcelFile(file)) {
        try {
          uploadFile = await normalizeExcelToCsvFile(file);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to parse Excel file";
          const errorMessage = `We couldn't parse that Excel file. ${message}. Please try: (1) Export your spreadsheet as CSV, (2) Check for empty rows/columns, or (3) Share a sample with support.`;
          const errorData: IngestResult = {
            ok: false,
            added: 0,
            count: 0,
            error: "excel_parse_failed",
            message: errorMessage,
          };
          const r: UploadResult = { ok: false, message: errorMessage, data: errorData };
          setResult(r);
          emitToastError("Excel Parse Failed", { description: errorMessage });
          setBusy(false);
          return;
        }
      } else if (!file.name.toLowerCase().endsWith(".csv")) {
        const errorMessage = "Unsupported file type. Please upload CSV or Excel (.xls/.xlsx).";
        const errorData: IngestResult = {
          ok: false,
          added: 0,
          count: 0,
          error: "unsupported_file_type",
          message: errorMessage,
        };
        const r: UploadResult = { ok: false, message: errorMessage, data: errorData };
        setResult(r);
        emitToastError("Unsupported File Type", { description: errorMessage });
        setBusy(false);
        return;
      }

      // Uses your existing API helper; falls back to direct fetch if needed.
      // Pass original format for backend metrics tracking
      const data = await uploadCsv(uploadFile, replace, originalFormat); // Auto-inference enabled

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

        // Ensure data has all required IngestResult fields
        const errorData: IngestResult = {
          ...(data as Partial<IngestResult>),
          ok: false,
          added: 0,
          count: 0,
          message: errorMsg,
        };

        const r: UploadResult = { ok: false, data: errorData, message: errorMsg };
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

      // Create a proper IngestResult structure for the error
      const errorData: IngestResult = {
        ok: false,
        added: 0,
        count: 0,
        error: "upload_failed",
        message: message,
      };

      const r: UploadResult = { ok: false, status, message, data: errorData };
      setResult(r);
      emitToastError("Upload Failed", { description: message });
    } finally {
      setBusy(false);
    }
  }, [file, replace, onUploaded, handleUploadSuccess, demoMode, disableDemoAsync]);

  const handleUseSampleData = useCallback(async () => {
    console.log('[UploadCsv] Demo seed starting');
    setBusy(true);
    setResult(null);
    try {
      // Use dedicated demo seed endpoint (idempotent - clears and reseeds)
      console.log('[UploadCsv] Calling demo seed endpoint');
      const data = await seedDemoData();
      console.log('[UploadCsv] Demo seed response:', data);

      if (!data.ok) {
        const errorMsg = data.message || "Failed to load demo data.";
        const errorData: IngestResult = {
          ok: false,
          added: 0,
          count: 0,
          message: errorMsg,
        };
        const r: UploadResult = { ok: false, data: errorData, message: errorMsg };
        setResult(r);
        toast.error("Import Failed", { description: errorMsg });
        return;
      }

      const successMsg = `Demo data loaded: ${data.transactions_added} transactions added.`;
      const successData: IngestResult = {
        ok: true,
        added: data.transactions_added,
        count: data.transactions_added,
        duplicates: 0,
        message: successMsg,
      };
      const r: UploadResult = { ok: true, data: successData, message: successMsg };
      setResult(r);

      toast.success("Demo data loaded successfully", {
        description: "Dashboard refreshed with sample transactions."
      });

      // Enable demo mode to view the seeded data
      enableDemo();

      // Trigger parent refresh (e.g., dashboard)
      triggerRefresh();
    } catch (err) {
      console.error(err);

      // Handle 409 Conflict: Demo seed blocked by real data
      if (err instanceof Error && (err as any).status === 409) {
        const errorMsg = err.message || "Cannot load demo data: you have uploaded transactions. Use Reset to clear all data first.";
        toast.error("Demo Data Blocked", {
          description: errorMsg,
          duration: 8000, // Longer duration for important message
        });
        const errorData: IngestResult = {
          ok: false,
          added: 0,
          count: 0,
          message: errorMsg,
        };
        setResult({ ok: false, data: errorData, message: errorMsg });
        return;
      }

      // Generic error handling
      const errorMsg = err instanceof Error ? err.message : "Could not load demo data. Please try again.";
      toast.error("Failed to load demo data", { description: errorMsg });
      const errorData: IngestResult = {
        ok: false,
        added: 0,
        count: 0,
        message: errorMsg,
      };
      setResult({ ok: false, data: errorData, message: errorMsg });
    } finally {
      setBusy(false);
    }
  }, [enableDemo, triggerRefresh]);

  const disabled = busy || !file;

  return (
    <div className={`w-full ${className ?? ""}`}>
        <header className="flex items-center justify-between border-b border-border pb-1">
          <h2 className="text-lg font-semibold">Upload Transactions (CSV / Excel)</h2>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
                disabled={busy}
              />
              Replace existing data
            </label>
            <Button
              onClick={reset}
              type="button"
              variant="pill-outline"
              size="sm"
              disabled={busy}
              data-testid="reset-dashboard-button"
            >
              {busy ? "Resetting..." : "Reset"}
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
            accept=".csv,.xls,.xlsx,text/csv"
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
                "Drop your file to upload"
              ) : (
                "Click to choose a file (CSV or Excel) or drag & drop here"
              )}
            </div>
            {!file && (
              <p className="text-xs opacity-70">
                Supported file formats: <span className="font-medium">CSV and Excel (.xls, .xlsx)</span>
              </p>
            )}
          </div>
        </label>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            data-testid="use-sample-data"
            variant="pill-outline"
            onClick={handleUseSampleData}
            disabled={busy}
            className="gap-2 px-3.5 h-9"
          >
            <Sparkles className="h-4 w-4" />
            Use sample data
          </Button>
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
          <div className="font-medium text-slate-100 mb-2">Supported CSV column layouts</div>
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

        {result && <IngestResultCard result={result.data as IngestResult} />}
  {/* hint removed per request */}
    </div>
  );
};

export default UploadCsv;
