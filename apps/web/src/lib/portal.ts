/**
 * portal.ts - Portal target helper for iframe isolation
 * 
 * Ensures all portals (Radix UI, custom React portals) target the iframe body
 * instead of document.body to avoid React #185 errors from browser extensions
 */

/**
 * Returns the portal container for components that need to portal content
 * 
 * When chat is mounted in iframe, returns iframe body for complete isolation.
 * Falls back to document.body for non-chat contexts.
 * 
 * Usage:
 * - For createPortal: createPortal(children, getPortalRoot())
 * - For Radix Portal: <Portal container={getPortalRoot()}>
 */
export const getPortalRoot = (): HTMLElement => {
  const portalRoot = (window as any).__LM_PORTAL_ROOT__;
  
  if (portalRoot) {
    return portalRoot;
  }
  
  // Fallback to document.body (when not in chat iframe context)
  console.warn('[portal] __LM_PORTAL_ROOT__ not found, falling back to document.body');
  return document.body;
};
