import * as React from "react";

export default function InitialsBadge({
  initials,
  title = "You",
  className = "size-8",
}: { initials: string; title?: string; className?: string }) {
  return (
    <div
      className={`${className} rounded-2xl border bg-muted grid place-items-center font-semibold`}
      aria-label={title}
      title={title}
    >
      <span className="text-sm leading-none select-none">{initials}</span>
    </div>
  );
}
