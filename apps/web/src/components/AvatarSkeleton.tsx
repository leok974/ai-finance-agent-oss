import * as React from "react";

export default function AvatarSkeleton({ className = "size-8" }: { className?: string }) {
  return (
    <div
      className={`${className} rounded-2xl bg-muted animate-pulse`}
      aria-hidden="true"
    />
  );
}
