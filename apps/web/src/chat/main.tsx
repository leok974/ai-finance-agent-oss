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
  
  if (!el) {
    console.error('[chat] no #chat-root — cannot mount');
    window.parent?.postMessage({ type: 'chat:error' }, window.location.origin);
    return;
  }

  try {
    // DIAGNOSTIC: Log container state before createRoot
    console.log('[chat] container:', {
      tag: el.tagName,
      id: el.id,
      childCount: el.childNodes?.length ?? 0,
      html: el.innerHTML?.slice(0, 120),
      hasRootContainer: !!(el as any)._reactRootContainer
    });

    // Guard against duplicate roots
    if ((el as any)._reactRootContainer) {
      console.warn('[chat] root already exists on container — skip createRoot');
      root = (el as any)._reactRootContainer;
    } else {
      // Clear any stale DOM
      if (el.childNodes.length > 0) {
        console.warn('[chat] container not empty before createRoot — clearing');
        el.textContent = '';
      }

      console.log('[chat] creating root in iframe...');
      root = createRoot(el);
      (el as any)._reactRootContainer = root;
      console.log('[chat] root created successfully');
    }

    // Render with providers
    root!.render(
      <ErrorBoundary
        fallback={(error) => {
          console.error('[chat] ErrorBoundary caught:', error);
          window.parent?.postMessage({ type: 'chat:error' }, window.location.origin);
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
    window.parent?.postMessage({ type: 'chat:error' }, window.location.origin);
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

/**
 * Expose portal root for components inside iframe
 */
(window as any).__LM_PORTAL_ROOT__ = document.body;
