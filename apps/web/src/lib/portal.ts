/**
 * portal.ts - Portal target helper for iframe isolation
 *
 * Ensures all portals (Radix UI, custom React portals) target the correct root:
 * - In chat iframe: iframe's document.body (via context or __LM_PORTAL_ROOT__)
 * - In main app: #__LM_PORTAL_ROOT__ div in main document
 * - Fallback: document.body
 */

const PORTAL_ID = '__LM_PORTAL_ROOT__';
let warned = false;

/**
 * Ensures portal root div exists in the document
 * Call once at boot (main.tsx) to create if missing
 */
export function ensurePortalRoot(): HTMLElement {
  let el = document.getElementById(PORTAL_ID) as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = PORTAL_ID;
    // Keep it out of layout/flow
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '2147480000';
    document.body.appendChild(el);
    console.log(`[portal] created ${PORTAL_ID} container`);
  }
  return el;
}

/**
 * Returns the portal container for components that need to portal content
 *
 * Priority:
 * 1. __LM_PORTAL_ROOT__ (set by chat iframe prelude to iframe's portal div)
 * 2. #__LM_PORTAL_ROOT__ (div in main document)
 * 3. document.body (fallback)
 *
 * Usage:
 * - For createPortal: createPortal(children, getPortalRoot())
 * - For Radix Portal: <Portal container={getPortalRoot()}>
 *
 * NOTE: This is a non-React function for use in Radix Portal components.
 * The chat iframe's prelude.ts sets (window as any).__LM_PORTAL_ROOT__
 * to ensure all portals target the iframe's document.
 */
export const getPortalRoot = (): HTMLElement => {
  // Check which document context we're in
  const isIframe = window !== window.parent;

  // ONLY check window.__LM_PORTAL_ROOT__ if we're in an iframe
  // This prevents parent window from accidentally using iframe's portal root
  if (isIframe) {
    const windowPortal = (window as any).__LM_PORTAL_ROOT__;
    if (windowPortal instanceof HTMLElement) {
      const sameDoc = windowPortal.ownerDocument === document;
      if (!sameDoc) {
        console.error('[portal] CROSS-DOCUMENT PORTAL DETECTED! window.__LM_PORTAL_ROOT__ belongs to a different document!');
        // Don't use it - fall through to next option
      } else {
        console.log('[portal] getPortalRoot() → iframe window.__LM_PORTAL_ROOT__');
        return windowPortal;
      }
    }
  }

  // Check for #__LM_PORTAL_ROOT__ div in current document
  const el = document.getElementById(PORTAL_ID);
  if (el) {
    console.log(`[portal] getPortalRoot() → #__LM_PORTAL_ROOT__ (iframe=${isIframe})`);
    return el;
  }

  // Fallback: document.body (warn once)
  if (!warned) {
    warned = true;
    console.warn(`[portal] ${PORTAL_ID} not found, falling back to document.body. This may cause React #185 in iframes.`);
  }
  console.warn(`[portal] getPortalRoot() → document.body (DANGEROUS! iframe=${isIframe})`);
  return document.body;
};
