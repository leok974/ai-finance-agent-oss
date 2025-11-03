import React, { useRef, useState } from "react";
import { ragIngest, ragQuery, ragIngestFiles } from "@/lib/api";

type Hit = { url: string; score: number; content: string };

export default function AdminKnowledgePanel() {
  const [urls, setUrls] = useState(
    "https://www.spotify.com/us/premium/\nhttps://www.netflix.com/signup/planform"
  );
  const [log, setLog] = useState<string[]>([]);
  const [q, setQ] = useState("spotify premium price");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [rerank, setRerank] = useState(true);

  // File ingest state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [vendor, setVendor] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  // helper to prepend logs (newest on top)
  function pushLogs(lines: string[]) {
    setLog((prev) => [...lines, ...prev]);
  }

  async function doIngest(force = false) {
    setBusy(true);
    try {
      const list = urls.split(/\s+/).filter(Boolean);
      const res = await ragIngest(list, force);
      setLog(
        res.results.map(
          (r) => `${r.status.toUpperCase()} — ${r.url}${r.chunks ? ` (${r.chunks} chunks)` : ""}`
        )
      );
    } finally {
      setBusy(false);
    }
  }
  async function doQuery() {
    setBusy(true);
    try {
      const res = await ragQuery(q, 8, rerank);
      setHits(res.hits);
    } finally {
      setBusy(false);
    }
  }

  async function doIngestFiles() {
    const input = fileInputRef.current;
    if (!input || !input.files || input.files.length === 0) return;
    setBusy(true);
    try {
      const pdfs = Array.from(input.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
      const res = await ragIngestFiles(pdfs, vendor || undefined);
      setLog(res.results.map(r => `${r.status.toUpperCase()} — ${r.file}${r.chunks ? ` (${r.chunks} chunks)` : r.reason ? ` (${r.reason})` : ''}`));
      // clear selected files
      input.value = "";
      setSelectedFiles([]);
    } finally {
      setBusy(false);
    }
  }

  async function doBulkIngest() {
    // Disable all controls during bulk
    setBusy(true);
    setUploading(true);
    try {
      const files = (selectedFiles.length
        ? selectedFiles
        : Array.from(fileInputRef.current?.files || [])
      ).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
      const urlList = urls.split(/\s+/).map(s => s.trim()).filter(Boolean);

      // 1) Upload PDFs (if any)
      if (files.length > 0) {
        pushLogs([`[FILES] Uploading ${files.length} PDF(s)…`]);
        const fileRes = await ragIngestFiles(files, vendor || undefined);
        const lines = fileRes.results.map(r =>
          `[FILES] ${r.status.toUpperCase()} — ${r.file}${r.chunks ? ` (${r.chunks} chunks)` : r.reason ? ` (${r.reason})` : ""}`
        );
        pushLogs(lines);
      } else {
        pushLogs([`[FILES] No PDFs selected — skipping`]);
      }

      // 2) Ingest URLs (if any)
      if (urlList.length > 0) {
        pushLogs([`[URLS] Ingesting ${urlList.length} URL(s)…`]);
        const urlRes = await ragIngest(urlList, false);
        type UrlRes = { url: string; status: string; chunks?: number };
        const lines = (urlRes.results as UrlRes[]).map((r) =>
          `[URLS] ${r.status.toUpperCase()} — ${r.url}${r.chunks ? ` (${r.chunks} chunks)` : ""}`
        );
        pushLogs(lines);
      } else {
        pushLogs([`[URLS] No URLs provided — skipping`]);
      }

      // Optional: auto-run a test query afterward
      if (q.trim()) {
        const res = await ragQuery(q.trim(), 8, rerank);
        setHits(res.hits);
        pushLogs([`[QUERY] Ran test query “${q.trim()}” — ${res.hits.length} hit(s)`]);
      }
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
      pushLogs([`[ERROR] ${msg}`]);
    } finally {
      setUploading(false);
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-4 rounded-2xl border bg-card">
      <h2 className="text-xl font-semibold">Knowledge (RAG)</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">URLs to ingest (one per line)</label>
          <textarea
            className="w-full min-h-[130px] rounded border bg-background p-2"
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
          />
          <div className="flex gap-2 flex-wrap">
            <button className="px-3 py-1 rounded-2xl border" disabled={busy} onClick={() => doIngest(false)}>
              Ingest
            </button>
            <button className="px-3 py-1 rounded-2xl border" disabled={busy} onClick={() => doIngest(true)}>
              Force re-ingest
            </button>
            <button
              className="px-3 py-1 rounded-2xl border bg-background hover:shadow"
              disabled={busy || uploading}
              onClick={doBulkIngest}
              title="Upload selected PDFs, then ingest URLs in one shot"
            >
              Bulk ingest (PDFs → URLs)
            </button>
          </div>
          <ul className="text-sm list-disc ml-5">
            {log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Test query</label>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded border bg-background px-2 py-1"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <label className="flex items-center gap-1 text-xs opacity-80">
              <input type="checkbox" checked={rerank} onChange={(e) => setRerank(e.target.checked)} />
              rerank
            </label>
            <button className="px-3 py-1 rounded-2xl border" disabled={busy} onClick={doQuery}>
              Search
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-auto">
            {hits.map((h, i) => (
              <div key={i} className="rounded border bg-background p-2">
                <div className="text-xs opacity-70">
                  {h.url} · {(h.score * 100).toFixed(1)}%
                </div>
                <div className="text-sm">{String(h.content || '').slice(0, 240)}…</div>
              </div>
            ))}
          </div>
          <div className="pt-4 space-y-2">
            <div className="text-sm font-medium">Upload PDFs</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="block w-full text-sm"
              onChange={(e) => {
                const fs = e.target.files ? Array.from(e.target.files) : [];
                setSelectedFiles(fs);
              }}
            />
            <div
              onDrop={(e) => {
                e.preventDefault();
                const dt = e.dataTransfer;
                if (dt?.files?.length) {
                  setSelectedFiles(Array.from(dt.files));
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              className="rounded-2xl border-2 border-dashed p-5 text-sm text-center bg-background/40"
            >
              Drag & drop PDFs here
            </div>
            <div className="flex gap-2 items-center">
              <input
                className="flex-1 rounded border bg-background px-2 py-1"
                placeholder="Vendor (optional)"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
              <button className="px-3 py-1 rounded-2xl border" disabled={busy} onClick={doIngestFiles}>Ingest PDFs</button>
            </div>
            <div className="text-xs opacity-70">
              {selectedFiles.length > 0 ? `${selectedFiles.length} PDF(s) selected` : 'No PDFs selected'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
