import * as React from "react";
import InitialsBadge from "@/components/InitialsBadge";
import AvatarSkeleton from "@/components/AvatarSkeleton";
import { getInitials } from "@/lib/name";

type Props = {
  who: "agent" | "user";
  className?: string;
  title?: string;
  displayName?: string | null;
  email?: string | null;
};

export default function EnvAvatar({
  who,
  className = "size-8",
  title,
  displayName = (import.meta.env.VITE_USER_NAME as string) || null,
  email = (import.meta.env.VITE_USER_EMAIL as string) || null,
}: Props) {
  const src =
    who === "agent"
      ? ((import.meta.env.VITE_AGENT_AVATAR as string) || "")
      : ((import.meta.env.VITE_USER_AVATAR as string) || "");

  const label = title || (who === "agent" ? "Agent" : displayName || "You");

  // If no src configured, go straight to non-image fallback
  if (!src) {
    if (who === "user") {
      return (
        <InitialsBadge
          initials={getInitials(displayName || email || "You")}
          title={label}
          className={className}
        />
      );
    }
    // Agent fallback SVG
    return (
      <svg viewBox="0 0 64 64" className={`${className} rounded-2xl border bg-muted`}>
        <rect x="6" y="10" width="52" height="44" rx="8" />
        <circle cx="24" cy="30" r="6" fill="white" />
        <circle cx="40" cy="30" r="6" fill="white" />
        <rect x="20" y="44" width="24" height="4" rx="2" fill="white" />
      </svg>
    );
  }

  // Image path exists → show shimmer until load completes; fallback on error
  const [loaded, setLoaded] = React.useState(false);
  const [errored, setErrored] = React.useState(false);

  if (errored) {
    if (who === "user") {
      return (
        <InitialsBadge
          initials={getInitials(displayName || email || "You")}
          title={label}
          className={className}
        />
      );
    }
    // Agent SVG fallback on error
    return (
      <svg viewBox="0 0 64 64" className={`${className} rounded-2xl border bg-muted`}>
        <rect x="6" y="10" width="52" height="44" rx="8" />
        <circle cx="24" cy="30" r="6" fill="white" />
        <circle cx="40" cy="30" r="6" fill="white" />
        <rect x="20" y="44" width="24" height="4" rx="2" fill="white" />
      </svg>
    );
  }

  return (
    <div className="relative" aria-label={label} title={label}>
      {!loaded && <AvatarSkeleton className={className} />}
      <img
        src={src}
        alt={label}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        className={[
          className,
          "rounded-2xl border bg-muted object-cover transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0",
          // ensure it overlays the skeleton
          "absolute inset-0",
        ].join(" ")}
      />
    </div>
  );
}
