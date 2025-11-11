/**
 * chat/portalRoot.ts - Portal container context for iframe
 *
 * Ensures all Radix UI portals target the iframe's document, not parent.
 * This prevents React #185 cross-document portal errors.
 */

import React from "react";

/**
 * Context that holds the portal container element for the chat iframe.
 * Set to iframe's document.body in chat/main.tsx.
 */
export const PortalContainerContext = React.createContext<HTMLElement | null>(null);

/**
 * Hook to get the iframe's portal container.
 * Returns iframe's document.body when properly configured.
 */
export const usePortalContainer = () => React.useContext(PortalContainerContext);
