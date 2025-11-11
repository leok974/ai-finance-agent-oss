/**
 * chat/ChatDockIframe.tsx - Iframe-aware wrapper for ChatDock
 *
 * Wraps ChatDock with iframe-scoped UI component overrides.
 * This ensures all Radix portals target the iframe's document.
 */

import React from 'react';
import ChatDock from '@/components/ChatDock';

// Pre-load patched UI components to ensure they're used
import '@/chat/ui';

/**
 * ChatDock component for use inside the chat iframe.
 * Same as regular ChatDock but with iframe-aware portal handling.
 */
export default function ChatDockIframe() {
  return <ChatDock />;
}
