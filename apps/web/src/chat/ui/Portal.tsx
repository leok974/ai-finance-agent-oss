/**
 * chat/ui/Portal.tsx - Iframe-aware portal wrapper
 *
 * Forces all Radix portals to target the iframe's document.
 * This is THE fix for React #185 cross-document portal errors.
 */

import * as React from "react";
import * as RadixPortal from "@radix-ui/react-portal";
import { usePortalContainer } from "../portalRoot";

export function Portal({ children }: { children: React.ReactNode }) {
  const container = usePortalContainer() ?? document.body;

  // Dev-only logging to confirm portals target iframe
  if (import.meta.env.DEV) {
    const docUrl = (container.ownerDocument as any)?.defaultView?.location?.href;
    console.log("[portal→iframe]", docUrl);
  }

  return <RadixPortal.Root container={container}>{children}</RadixPortal.Root>;
}
