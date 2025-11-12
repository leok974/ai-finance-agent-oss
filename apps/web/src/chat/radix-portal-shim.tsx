/**
 * radix-portal-shim.tsx - Universal iframe-aware portal shim
 *
 * This replaces @radix-ui/react-portal for the chat bundle via Vite alias.
 * ALL Radix portals (Tooltip, Dropdown, Toast, Dialog, etc.) will use this
 * instead of the original package, ensuring they render to the iframe document.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { usePortalContainer } from "./portalRoot";

console.log("[radix-portal-shim] active (BUILD_CHAT=", import.meta.env.BUILD_CHAT, ")");

// Match Radix's API surface we actually use: <Portal.Root container?>
export type RootProps = {
  container?: Element | null;
  children?: React.ReactNode;
};

export const Root: React.FC<RootProps> = ({ container, children }) => {
  // Always prefer the iframe body provided by context.
  const ctx = usePortalContainer();

  // CRITICAL: Validate container early to prevent "Cannot read properties of undefined"
  let target: Element;

  // 1) Try explicit container prop (if valid)
  if (container && typeof container === 'object' && 'nodeType' in container) {
    target = container as Element;
  }
  // 2) Fall back to context (iframe body)
  else if (ctx && typeof ctx === 'object' && 'nodeType' in ctx) {
    target = ctx as Element;
  }
  // 3) Last resort: current document.body
  else {
    console.warn("[radix-portal-shim] both container and context invalid, using document.body", {
      container,
      ctx,
      stack: new Error().stack?.split("\n").slice(1, 3).join("\n"),
    });
    target = document.body;
  }

  // Check for cross-document portal attempts BEFORE createPortal
  const tdoc = (target as any)?.ownerDocument;
  if (tdoc && tdoc !== document) {
    console.error("[radix-portal-shim] CROSS-DOC (pre-retarget)", {
      nodeName: (target as any)?.nodeName,
      href: tdoc?.defaultView?.location?.href,
      expectedHref: document.defaultView?.location?.href,
      stack: new Error().stack?.split("\n").slice(1, 5).join("\n"),
    });
    target = document.body; // retarget to iframe
  }

  const wrap = <div data-radix-portal="true">{children}</div>;
  return createPortal(wrap, target);
};

// Export both named and default to match Radix's original exports
export const Portal = { Root };
export default Portal;
