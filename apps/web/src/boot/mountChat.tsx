/**
 * mountChat.tsx - Chat rendered in iframe for complete DOM isolation
 * 
 * CRITICAL ARCHITECTURE:
 * - Renders chat inside iframe document (not Shadow DOM)
 * - iframe provides complete isolation from browser extension DOM pollution
 * - All portals target iframe body via window.__LM_PORTAL_ROOT__
 * - Clears stale DOM BEFORE createRoot to prevent React #185
 * - Single root creation - never calls replaceChildren() after root exists
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { AuthProvider } from '@/state/auth';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ChatDockProvider } from '@/context/ChatDockContext';
import ChatDock from '@/components/ChatDock';
import ErrorBoundary from '@/components/ErrorBoundary';

let root: Root | null = null;

/**
 * Mounts ChatDock in iframe for complete isolation from browser extensions
 * Safe to call multiple times - will reuse existing root
 */
export function mountChatDock(): void {
  // Safety guard: prevent duplicate chat root creation
  if ((window as any).__LM_CHAT_ROOT_CREATED__) {
    console.warn('[lm] duplicate chat root creation blocked');
    return;
  }
  (window as any).__LM_CHAT_ROOT_CREATED__ = true;

  try {
    // 1) Get or create host element
    let host = document.querySelector('lm-chatdock-host') as HTMLElement | null;
    if (!host) {
      host = document.createElement('lm-chatdock-host');
      document.body.appendChild(host);
    }

    // 2) Attach shadow root once (for additional isolation layer)
    const sr = host.shadowRoot ?? host.attachShadow({ mode: 'open' });

    // 3) Create iframe container (isolates DOM + portals completely)
    let frame = sr.querySelector('#lm-chat-frame') as HTMLIFrameElement | null;
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'lm-chat-frame';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      frame.style.cssText =
        'all:unset;position:fixed;inset:auto 24px 24px auto;width:420px;height:640px;border:0;z-index:2147483647;pointer-events:auto;';
      sr.appendChild(frame);
    }

    const doc = frame.contentDocument!;
    const win = frame.contentWindow!;

    // 4) Initialize iframe document if needed
    if (!doc.getElementById('lm-chat-root')) {
      doc.open();
      doc.write(`<!doctype html><html><head><meta charset="utf-8"></head>
        <body><div id="lm-chat-root"></div></body></html>`);
      doc.close();
    }

    const container = doc.getElementById('lm-chat-root')!;

    // 5) Inject styles BEFORE root creation (safer timing)
    injectStyles(doc);

    // 6) Single root (never replaceChildren once root exists)
    if (!root) {
      // CRITICAL: Clear ANY stale DOM immediately before createRoot (React #185 safeguard)
      // Browser extensions can inject DOM between doc.close() and createRoot()
      container.textContent = ''; // Nuclear option - clear everything
      console.log('[chat] creating root in iframe...');
      root = (win as any).__LM_CHAT_ROOT__ ?? createRoot(container);
      (win as any).__LM_CHAT_ROOT__ = root;
      console.log('[chat] root created successfully');
    } else {
      console.log('[chat] reusing existing root');
    }

    // 7) Expose iframe body for all portals (complete isolation from main document)
    (window as any).__LM_PORTAL_ROOT__ = doc.body;

    // 8) Render with providers
    console.log('[chat] rendering...');
    root.render(
      <ErrorBoundary fallback={(e) => {
        console.error('[chat] ErrorBoundary caught:', e);
        return <div style={{ display: 'none' }} />;
      }}>
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <ChatDockProvider>
              <ChatDock />
            </ChatDockProvider>
          </TooltipProvider>
        </AuthProvider>
      </ErrorBoundary>
    );

    console.info('[chat] mounted in iframe');
  } catch (error) {
    console.error('[chat] mount failed', error);
    // Trip session fuse on error
    sessionStorage.setItem('lm:disableChat', '1');
    throw error;
  }
}

/**
 * Injects styles into iframe document
 * Copies all stylesheets from main document for Tailwind support
 */
function injectStyles(doc: Document): void {
  // Check if styles already injected
  if (doc.querySelector('style[data-chat-styles]')) {
    return;
  }

  // Create style element
  const style = doc.createElement('style');
  style.setAttribute('data-chat-styles', 'true');

  // Copy all stylesheets from main document
  const mainStyles = Array.from(document.styleSheets)
    .map(sheet => {
      try {
        return Array.from(sheet.cssRules)
          .map(rule => rule.cssText)
          .join('\n');
      } catch (e) {
        // CORS-blocked stylesheets can't be read
        console.warn('[chat] Could not read stylesheet:', sheet.href, e);
        return '';
      }
    })
    .join('\n');

  style.textContent = mainStyles;
  doc.head.appendChild(style);
}

/**
 * Unmounts chat (for cleanup if needed)
 */
export function unmountChatDock(): void {
  if (root) {
    root.unmount();
    root = null;
  }

  const host = document.querySelector('lm-chatdock-host');
  if (host) {
    host.remove();
  }

  delete (window as any).__LM_PORTAL_ROOT__;
  delete (window as any).__LM_CHAT_ROOT_CREATED__;

  console.info('[chat] unmounted');
}
