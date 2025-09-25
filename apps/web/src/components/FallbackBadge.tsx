import React from 'react'

export default function FallbackBadge({ provider = 'openai' }: { provider?: string }) {
  const pretty = provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'OpenAI';
  const label = `Fallback: ${pretty}`;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/15 pl-2 pr-1 py-0.5 text-[11px] font-medium text-amber-300 shadow-sm"
      aria-label={`${label} (local model was unavailable)`}
      title="Local LLM was temporarily unavailable; response generated via fallback provider."
    >
      <svg width="12" height="12" viewBox="0 0 24 24" className="opacity-80" aria-hidden="true">
        <path fill="currentColor" d="M11 7h2v6h-2zm0 8h2v2h-2z"/>
      </svg>
      {label}
      <a
        href="/docs/local-vs-cloud.html"
        target="_blank"
        rel="noreferrer noopener"
        aria-label="Learn about local vs. cloud fallback (opens in a new tab)"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-400/50 text-amber-200 hover:text-amber-100 hover:border-amber-300/70"
        title="What is fallback?"
      >
        i
      </a>
    </span>
  );
}
