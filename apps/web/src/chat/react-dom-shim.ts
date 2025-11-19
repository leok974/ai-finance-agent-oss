// apps/web/src/chat/react-dom-shim.ts
// NOTE: This shim REPLACES react-dom for the chat bundle only via Vite plugin alias
// We cannot use "import * from 'react-dom-real'" because it creates module resolution issues
// Instead, we dynamically access the real react-dom at runtime

// Get the REAL createPortal from react-dom
// @ts-expect-error - accessing internal webpack/vite module cache
const realReactDOM = __REAL_REACT_DOM__;
const realCreatePortal = realReactDOM?.createPortal;

if (!realCreatePortal) {
  console.error('[react-dom-shim] CRITICAL: Could not find real createPortal');
}

// --- Patched createPortal (module-init) ---
export function createPortal(children: any, container: any, ...rest: any[]) {
  try {
    const localDoc = document; // iframe doc

    // 1) invalid/missing containers → iframe body
    const isValid =
      container &&
      (container.nodeType === 1 /* ELEMENT */ ||
        container.nodeType === 11 /* DOCUMENT_FRAGMENT */);

    if (!isValid) {
      console.warn("[react-dom-shim] invalid/missing container → iframe body", {
        received: container?.nodeType ?? container,
      });
      container = localDoc.body;
    }

    // 2) cross-document containers → iframe body
    const cdoc = container?.ownerDocument;
    if (cdoc && cdoc !== localDoc) {
      console.warn("[react-dom-shim] cross-document container → iframe body", {
        href: cdoc?.defaultView?.location?.href,
      });
      container = localDoc.body;
    }
  } catch {
    // best-effort
  }

  if (!realCreatePortal) {
    throw new Error('[react-dom-shim] Cannot create portal - real createPortal not found');
  }

  return realCreatePortal(children, container, ...rest);
}

// Re-export everything else from the REAL module
export * from "react-dom/client";

// Vis marker
// eslint-disable-next-line no-console
console.log("[react-dom-shim] active (createPortal patched)");
