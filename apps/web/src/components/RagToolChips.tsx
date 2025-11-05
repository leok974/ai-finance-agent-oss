// apps/web/src/components/RagToolChips.tsx
/**
 * RAG Tool Chips - Admin-only quick actions for knowledge management
 * Provides UI for status, rebuild, seed, and ingest operations
 * Only visible to admins with dev_unlocked in dev environment
 */
import React, { useState } from 'react';
import { useShowDevTools } from '@/state/auth';
import { fetchJSON } from '@/lib/http';

interface RagToolChipsProps {
  onReply: (message: string) => void;
}

export function RagToolChips({ onReply }: RagToolChipsProps) {
  const showDevTools = useShowDevTools();
  const [loading, setLoading] = useState<string | null>(null);

  if (!showDevTools) {
    return null; // Only show to admins with dev_unlocked in dev environment
  }

  const runAction = async (action: string, label: string, bodyData: Record<string, unknown> = {}) => {
    setLoading(action);
    try {
      const res: Record<string, unknown> = await fetchJSON(`agent/tools/rag/${action}`, {
        method: 'POST',
        body: JSON.stringify(bodyData),
      });

      if (res?.ok) {
        const result = (res.result as Record<string, unknown>) || res;
        let message = `✅ ${label}`;

        // Format result details
        if (result.documents !== undefined) {
          message += ` (${result.documents} docs, ${result.chunks || 0} chunks)`;
          if (Array.isArray(result.vendors) && result.vendors.length > 0) {
            const vendors = result.vendors as string[];
            message += ` • Vendors: ${vendors.slice(0, 3).join(', ')}${vendors.length > 3 ? '...' : ''}`;
          }
        } else if (result.seeded) {
          message += ` (${result.seeded} URLs)`;
        } else if (result.message) {
          message += ` • ${result.message}`;
        }

        onReply(message);
      } else {
        onReply(`❌ ${label} failed`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('403') || msg.includes('Admin only')) {
        onReply(`🔒 ${label} requires admin access`);
      } else if (msg.includes('Dev route disabled')) {
        onReply(`⚠️ ${label} requires dev mode (set ALLOW_DEV_ROUTES=1)`);
      } else {
        onReply(`⚠️ ${label} failed: ${msg}`);
      }
    } finally {
      setLoading(null);
    }
  };

  const ingestUrl = async () => {
    const url = window.prompt('Enter URL to ingest:');
    if (!url || !url.startsWith('http')) {
      onReply('⚠️ Please provide a valid URL starting with http:// or https://');
      return;
    }
    await runAction('rag.ingest_url', `Ingested ${url}`, { url });
  };

  const ingestPdf = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setLoading('rag.ingest_pdf');
      try {
        const formData = new FormData();
        formData.append('file', file);

        const { http } = await import('@/lib/http');
        const res = await http('/agent/tools/rag/ingest_pdf', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          const result = data.result?.results?.[0];
          if (result?.status === 'ingested') {
            onReply(`✅ Ingested PDF: ${file.name} (${result.chunks} chunks)`);
          } else {
            onReply(`✅ Ingested PDF: ${file.name}`);
          }
        } else {
          onReply(`❌ PDF ingest failed: ${res.statusText}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        onReply(`⚠️ PDF ingest error: ${msg}`);
      } finally {
        setLoading(null);
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-wrap gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
      <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 w-full mb-1">
        RAG Tools (Admin)
      </div>

      <button
        onClick={() => runAction('rag.status', 'RAG Status')}
        disabled={loading !== null}
        className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded transition"
      >
        {loading === 'rag.status' ? '...' : 'Status'}
      </button>

      <button
        onClick={() => runAction('rag.rebuild', 'Rebuild Index')}
        disabled={loading !== null}
        className="px-3 py-1 text-sm bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white rounded transition"
      >
        {loading === 'rag.rebuild' ? '...' : 'Rebuild'}
      </button>

      <button
        onClick={() => runAction('rag.seed', 'Seed Index')}
        disabled={loading !== null}
        className="px-3 py-1 text-sm bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded transition"
        title="Dev-only: Seeds starter vendor URLs"
      >
        {loading === 'rag.seed' ? '...' : 'Seed (dev)'}
      </button>

      <button
        onClick={ingestUrl}
        disabled={loading !== null}
        className="px-3 py-1 text-sm bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white rounded transition"
      >
        {loading === 'rag.ingest_url' ? '...' : 'Ingest URL'}
      </button>

      <button
        onClick={ingestPdf}
        disabled={loading !== null}
        className="px-3 py-1 text-sm bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-400 text-white rounded transition"
      >
        {loading === 'rag.ingest_pdf' ? '...' : 'Ingest PDF'}
      </button>
    </div>
  );
}
