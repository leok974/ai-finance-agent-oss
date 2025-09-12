import * as React from 'react';

type Props = {
  dbRevision?: string | null;
  inSync?: boolean;
};

export default function DbRevBadge({ dbRevision, inSync }: Props) {
  if (!dbRevision) return null;
  const ok = inSync !== false;
  return (
    <span
      title={ok ? 'DB schema is in sync with code' : 'DB schema is NOT in sync with code'}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-2xl border
        ${ok ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
             : 'bg-amber-500/10 text-amber-300 border-amber-500/30'}`}
    >
      <span className="w-2 h-2 rounded-full border border-current"
            style={{ boxShadow: ok ? '0 0 6px rgba(16,185,129,.7)' : '0 0 6px rgba(245,158,11,.7)' }} />
      <span className="opacity-80">db</span>
      <span className="font-semibold">{dbRevision.slice(0, 12)}</span>
    </span>
  );
}
