/**
 * chat/main.tsx - Chat iframe self-mount entry
 * 
 * CRITICAL: This runs INSIDE the sandboxed iframe (unique origin, no allow-same-origin).
 * Parent cannot access this document. We self-mount and communicate via postMessage only.
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AuthProvider } from '@/state/auth';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatDockProvider } from '@/context/ChatDockContext';
import ChatDock from '@/components/ChatDock';
import ErrorBoundary from '@/components/ErrorBoundary';
import '@/index.css';

let root: Root | null = null;

/**
 * Self-mount inside iframe
 */
function mountChat(): void {
  const el = document.getElementById('chat-root');
  const portalRoot = document.getElementById('__LM_PORTAL_ROOT__');
  
  // CRITICAL: Expose portal root IMMEDIATELY, before any checks or logging
  // This ensures getPortalRoot() finds it during React's initial render
  // Use document.body in iframe context to avoid cross-document issues with Radix Portal
  if (portalRoot) {
    (window as any).__LM_PORTAL_ROOT__ = document.body;
  }
  
  if (!el) {
    console.error('[chat] no #chat-root — cannot mount');
    window.parent?.postMessage({ type: 'chat:error', error: 'no_chat_root' }, window.location.origin);
    return;
  }

  if (!portalRoot) {
    console.error('[chat] no #__LM_PORTAL_ROOT__ — portals will fail');
    window.parent?.postMessage({ type: 'chat:error', error: 'no_portal_root' }, window.location.origin);
    return;
  }

  try {
    // DIAGNOSTIC: Log container state before createRoot
    console.log('[chat] container:', {
      tag: el.tagName,
      id: el.id,
      childCount: el.childNodes?.length ?? 0,
      html: el.innerHTML?.slice(0, 120),
      hasRootContainer: !!(el as any).__root
    });

    console.log('[chat] portal root:', {
      tag: portalRoot.tagName,
      id: portalRoot.id,
      exists: true
    });

    // Guard against duplicate roots (HMR safety)
    if ((el as any).__root) {
      console.warn('[chat] root already exists — reusing');
      root = (el as any).__root;
    } else {
      // Clear any stale DOM
      if (el.childNodes.length > 0) {
        console.warn('[chat] container not empty before createRoot — clearing');
        el.textContent = '';
      }

      console.log('[chat] creating root in iframe...');
      root = createRoot(el);
      (el as any).__root = root;
      console.log('[chat] root created successfully');
    }

    console.log('[chat] portal root exposed:', {
      el: portalRoot,
      id: portalRoot.id,
      windowProperty: '__LM_PORTAL_ROOT__',
      actualValue: (window as any).__LM_PORTAL_ROOT__
    });

    // Render with providers
    root!.render(
      <ErrorBoundary
        fallback={(error) => {
          console.error('[chat] ErrorBoundary caught:', error);
          window.parent?.postMessage({ type: 'chat:error', error: error.message }, window.location.origin);
          return <div style={{ display: 'none' }} />;
        }}
      >
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <ChatDockProvider>
              <ChatDock />
            </ChatDockProvider>
          </TooltipProvider>
        </AuthProvider>
      </ErrorBoundary>
    );

    console.info('[chat] mounted successfully');
    
    // Notify parent that chat is ready
    window.parent?.postMessage({ type: 'chat:ready' }, window.location.origin);
  } catch (error) {
    console.error('[chat] mount failed:', error);
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

/**
 * Mount when DOM is ready
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountChat);
} else {
  mountChat();
}
