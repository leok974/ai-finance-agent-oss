import * as React from 'react';
import { getMetaInfo, MetaInfo } from '../lib/api';
import { Info } from 'lucide-react';

type RowProps = { label: string; value?: React.ReactNode };
const Row = ({ label, value }: RowProps) => (
  <div className="flex items-start gap-3 py-1">
    <div className="w-32 shrink-0 text-sm text-muted-foreground">{label}</div>
    <div className="text-sm break-all">{value ?? '—'}</div>
  </div>
);

export default function AboutDrawer() {
  const [open, setOpen] = React.useState(false);
  const [data, setData] = React.useState<MetaInfo | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getMetaInfo());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally { setLoading(false); }
  }, []);

  React.useEffect(() => {
    if (open && !data && !loading && !error) { load(); }
  }, [open, data, loading, error, load]);

  const inSync = data?.alembic?.in_sync;
  const dbRev = data?.alembic?.db_revision ?? null;
  const head = data?.alembic?.code_head ?? null;
  const heads = data?.alembic?.code_heads ?? [];
  const migs = data?.alembic?.recent_migrations ?? [];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-2xl border px-3 py-1.5 text-sm
                   bg-card border-border hover:bg-accent/20 transition"
        title="About / System Info"
      >
        <Info className="h-4 w-4" />
        About
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          {/* panel */}
          <div className="ml-auto h-full w-full max-w-xl bg-background border-l border-border p-4 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">About this app</div>
              <button className="text-sm opacity-70 hover:opacity-100" onClick={() => setOpen(false)}>Close</button>
            </div>

            {loading && <div className="text-sm opacity-70">Loading…</div>}
            {error && (
              <div className="text-sm text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                Failed to load meta info: <code>{error}</code>
                <div className="mt-2">
                  <button onClick={load} className="text-xs underline">Retry</button>
                </div>
              </div>
            )}

            {data && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-2 text-xs font-medium px-2 py-0.5 rounded-2xl border
                    ${inSync ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                             : 'bg-amber-500/10 text-amber-300 border-amber-500/30'}`}>
                    <span className="w-2 h-2 rounded-full border border-current" />
                    {inSync ? 'DB in sync' : 'DB out of sync'}
                  </span>
                </div>

                <div className="space-y-1">
                  <Row label="Engine" value={<code>{data.engine}</code>} />
                  <Row label="DB revision" value={<code>{dbRev || '—'}</code>} />
                  <Row label="Code head" value={<code>{head || '—'}</code>} />
                  <Row label="All heads" value={<code>{heads?.join(', ') || '—'}</code>} />
                </div>

                <div className="mt-2">
                  <div className="text-sm font-semibold mb-2 opacity-80">Recent migrations</div>
                  <div className="border border-border rounded-2xl divide-y divide-border">
                    {migs.length === 0 && <div className="p-3 text-sm opacity-70">No migrations found</div>}
                    {migs.map((m) => (
                      <div key={m.revision} className="p-3">
                        <div className="flex items-center justify-between">
                          <code className="text-xs">{m.revision}</code>
                          {m.is_head && <span className="text-[10px] px-2 py-0.5 rounded-full border border-border">HEAD</span>}
                        </div>
                        {m.message && <div className="text-xs mt-1 opacity-80">{m.message}</div>}
                        <div className="text-[11px] mt-1 opacity-60">
                          <span className="mr-2">down:</span>
                          <code>{Array.isArray(m.down_revision) ? m.down_revision.join(', ') : (m.down_revision ?? 'None')}</code>
                        </div>
                        <div className="text-[11px] mt-1 opacity-60">
                          <span className="mr-2">file:</span>
                          <code>{m.module}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
