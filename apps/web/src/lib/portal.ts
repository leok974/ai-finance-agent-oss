/**
 * portal.ts - Portal target helper for iframe isolation
 * 
 * Ensures all portals (Radix UI, custom React portals) target the correct root:
 * - In chat iframe: iframe's document.body (via __LM_PORTAL_ROOT__)
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
 * 1. __LM_PORTAL_ROOT__ (set by chat iframe to its document.body)
 * 2. #__LM_PORTAL_ROOT__ (div in main document)
 * 3. document.body (fallback)
 * 
 * Usage:
 * - For createPortal: createPortal(children, getPortalRoot())
 * - For Radix Portal: <Portal container={getPortalRoot()}>
 */
export const getPortalRoot = (): HTMLElement => {
  // Priority 1: iframe sets this to its own document.body
  const windowPortal = (window as any).__LM_PORTAL_ROOT__;
  if (windowPortal) {
    return windowPortal;
  }
  
  // Priority 2: main document has #__LM_PORTAL_ROOT__ div
  const el = document.getElementById(PORTAL_ID);
  if (el) {
    return el;
  }
  
  // Fallback: document.body (warn once)
  if (!warned) {
    warned = true;
    console.warn(`[portal] ${PORTAL_ID} not found, falling back to document.body`);
  }
  return document.body;
};
