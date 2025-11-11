/**
 * chat/main.tsx - Chat iframe self-mount entry
 *
 * CRITICAL: This runs INSIDE the sandboxed iframe (same-origin with allow-same-origin).
 * Portal guards are in prelude.ts which MUST load before this file.
 */

import './react-dom-guard'; // MUST precede any Radix/portal usage

// 🎨 CRITICAL: Import styles for iframe (Tailwind + theme tokens)
import './index.css';      // Chat-specific Tailwind
import '@/index.css';      // Global app styles with theme variables

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AuthProvider } from '@/state/auth';
import { ChatDockProvider } from '@/context/ChatDockContext';
import ChatDock from '@/components/ChatDock';
import { ChatErrorBoundary } from './ChatErrorBoundary';
import { patchCreatePortalToIframe } from './crossDocumentPortalHotfix';
import { PortalContainerContext } from './portalRoot';
import { TooltipProvider, Toaster } from './ui'; // Use chat-patched UI with Toaster

// OVERLAY KILL-SWITCH: Disable all Radix overlays to isolate React #185
const DISABLE_OVERLAYS = import.meta.env.VITE_DISABLE_OVERLAYS === '1';
if (DISABLE_OVERLAYS) {
  console.warn('[chat] 🚨 OVERLAY KILL-SWITCH ACTIVE — All Radix overlays disabled for debugging');
}

// HOTFIX: Patch createPortal IMMEDIATELY at module load, before any components render
patchCreatePortalToIframe(document);

/**
 * Boot chat with providers
 * Called by entry.tsx after safe mode check
 */
export function bootChat(root: Root): void {
  const el = document.getElementById('lm-chat-root');
  const portalRoot = document.getElementById('__LM_PORTAL_ROOT__');

  if (!el) {
    console.error('[chat] no #lm-chat-root — cannot mount');
    window.parent?.postMessage({ type: 'chat:error', error: 'no_chat_root' }, window.location.origin);
    return;
  }

  if (!portalRoot) {
    console.warn('[chat] no #__LM_PORTAL_ROOT__ — creating fallback');
    const fallback = document.createElement('div');
    fallback.id = '__LM_PORTAL_ROOT__';
    document.body.appendChild(fallback);
  }

  try {
    // DIAGNOSTIC: Log container state before render
    console.log('[chat] container:', {
      tag: el.tagName,
      id: el.id,
      childCount: el.childNodes?.length ?? 0,
      html: el.innerHTML?.slice(0, 120)
    });

    console.log('[chat] root.render() ABOUT TO BE CALLED');
    console.log('[chat] root object:', root);

    // Render with providers (PortalContainerContext points to iframe's document for safe portals)
    root.render(
      <ChatErrorBoundary>
        <PortalContainerContext.Provider value={document.body}>
          <AuthProvider>
            {DISABLE_OVERLAYS ? (
              // KILL-SWITCH: No overlay providers when debugging
              <ChatDockProvider>
                <ChatDock />
              </ChatDockProvider>
            ) : (
              // Normal: Full overlay stack
              <TooltipProvider delayDuration={200}>
                <ChatDockProvider>
                  <ChatDock />
                  <Toaster />
                </ChatDockProvider>
              </TooltipProvider>
            )}
          </AuthProvider>
        </PortalContainerContext.Provider>
      </ChatErrorBoundary>
    );

    console.log('[chat] root.render() COMPLETED');

    console.info('[chat] mounted successfully');

    // Notify parent that chat is ready
    window.parent?.postMessage({ type: 'chat:ready' }, window.location.origin);
  } catch (error) {
    console.error('[chat] boot failed:', error);
    window.parent?.postMessage({ type: 'chat:error', error: String(error) }, window.location.origin);
  }
}

/**
 * Listen for config from parent (optional)
 */
window.addEventListener('message', (e: MessageEvent) => {
  if (e.origin !== window.location.origin) return;

  if (e.data?.type === 'chat:init') {
    console.log('[chat] received init config:', e.data.config);
    // Apply config if needed
  }
});
