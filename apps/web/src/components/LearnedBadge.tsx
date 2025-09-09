import * as React from 'react';

export default function LearnedBadge({ note = 'learned' }: { note?: string }) {
  return (
  <span className="ml-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-border bg-card/60 animate-fade-slide-up">
      <span aria-hidden>✓</span>
      <span className="opacity-80">{note}</span>
    </span>
  );
}
