/**
 * chat/main.tsx - Chat iframe self-mount entry
 * 
 * CRITICAL: This runs INSIDE the sandboxed iframe (same-origin with allow-same-origin).
 * We use portal guards to prevent React #185 from cross-document portal attempts.
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import * as ReactDOM from 'react-dom';
import { AuthProvider } from '@/state/auth';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatDockProvider } from '@/context/ChatDockContext';
import ChatDock from '@/components/ChatDock';
import ErrorBoundary from '@/components/ErrorBoundary';
import '@/index.css';

let root: Root | null = null;

/**
 * Ensure portal roots exist in iframe's document before any React rendering
 * This prevents timing issues and guarantees stable portal targets
 */
function ensureIframeRoots() {
  const d = document;

  const ensure = (id: string) => {
    let el = d.getElementById(id);
    if (!el) {
      el = d.createElement('div');
      el.id = id;
      // Keep these out of layout; libraries will absolutely position them
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.pointerEvents = 'none';
      el.style.zIndex = '2147483647';
      d.body.appendChild(el);
      console.log(`[portal-guard] created ${id} in iframe document`);
    }
    return el as HTMLElement;
  };

  // Primary portal root used by our code and as default fallback
  const portal = ensure('__LM_PORTAL_ROOT__');

  // Common 3rd-party targets (shadcn/sonner/radix stacks)
  ensure('sonner-toaster');        // if we use sonner / toasts
  ensure('radix-portal-root');     // generic radix portal target

  // Expose to code/tests
  (window as any).__LM_PORTAL_ROOT__ = portal;
  (window as any).__REACT_PORTAL_GUARD__ = true;
  
  console.log('[portal-guard] iframe roots ensured, portal=', portal);
}

/**
 * Monkey-patch ReactDOM.createPortal to defensively reroute bad containers
 * If any library tries to portal into a cross-document node, rewrite to iframe's portal root
 */
(() => {
  const rootGetter = () =>
    (document.getElementById('__LM_PORTAL_ROOT__') as HTMLElement) || document.body;

  const orig = (ReactDOM as any).createPortal?.bind(ReactDOM);
  if (!orig) {
    console.warn('[portal-guard] ReactDOM.createPortal not found, skipping patch');
    return;
  }

  (ReactDOM as any).createPortal = (children: any, container: any, ...rest: any[]) => {
    // Valid only if container is an Element in THIS iframe's document
    const valid =
      container instanceof Element &&
      container.ownerDocument === document &&
      container.nodeType === 1;

    if (!valid) {
      console.warn('[portal-guard] bad container for portal; rerouting to __LM_PORTAL_ROOT__', {
        container,
        ownerDoc: container?.ownerDocument,
        thisDoc: document,
        nodeType: container?.nodeType
      });
      container = rootGetter();
    }
    return orig(children, container, ...rest);
  };
  
  console.log('[portal-guard] ReactDOM.createPortal patched');
})();

// Ensure portal roots BEFORE any imports that might create portals
ensureIframeRoots();

/**
 * Self-mount inside iframe
 */
function mountChat(): void {
  const el = document.getElementById('chat-root');
  const portalRoot = document.getElementById('__LM_PORTAL_ROOT__');
  
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
