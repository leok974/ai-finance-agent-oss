/**
 * chat/main.tsx - Chat iframe self-mount entry
 *
 * CRITICAL: This runs INSIDE the sandboxed iframe (same-origin with allow-same-origin).
 */

// Build stamp for chat bundle
declare const __WEB_BRANCH__: string;
declare const __WEB_COMMIT__: string;
declare const __WEB_BUILD_TIME__: string;

// eslint-disable-next-line no-console
console.log("[build/chat]", `${__WEB_BRANCH__}@${__WEB_COMMIT__}`, __WEB_BUILD_TIME__);

// DevDiag structured logging helper (for console capture)
(window as any).__DEVLOG = (tag: string, data: unknown) =>
  console.log(`[devlog] ${tag}`, JSON.stringify(data, null, 2));

// 🎨 CRITICAL: Import styles for iframe (Tailwind + theme tokens)
import './index.css';      // Chat-specific Tailwind
import '@/index.css';      // Global app styles with theme variables

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AuthProvider } from '@/state/auth';
import { ChatIframe } from './ChatIframe'; // Simplified grid-based chat for iframe
import { ChatErrorBoundary } from './ChatErrorBoundary';
import { PortalContainerContext } from './portalRoot';
import { TooltipProvider, Toaster } from './ui'; // Use chat-patched UI with Toaster

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
            <TooltipProvider delayDuration={200}>
              <ChatIframe />
              <Toaster />
            </TooltipProvider>
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
