/**
 * portalRoot.ts - Proper iframe-scoped portal container
 *
 * Provides a context for portal container so all Radix/shadcn components
 * can target the iframe's document instead of the parent window.
 *
 * This is the permanent fix for React #185 cross-document portal errors.
 */

import React from 'react';

/**
 * Context that holds the portal container element.
 * For the chat iframe, this will be the iframe's document.body.
 * For the main app, this will be the main document.body.
 */
export const PortalContainerContext = React.createContext<HTMLElement | null>(null);

/**
 * Hook to get the current portal container.
 * Returns the iframe's body when used in chat, or null (falls back to document.body).
 */
export function usePortalContainer(): HTMLElement | null {
  return React.useContext(PortalContainerContext);
}
