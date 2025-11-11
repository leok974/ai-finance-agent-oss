/**
 * mountChat.tsx - Chat iframe bootstrap (parent side)
 *
 * CRITICAL ARCHITECTURE:
 * - Chat runs in sandboxed iframe with same-origin (for asset loading)
 * - Sandbox: allow-scripts allow-popups allow-same-origin
 * - Blocks: top navigation, forms, modals, downloads
 * - Iframe loads /chat/index.html (real page, no srcdoc tricks)
 * - Communication via postMessage ONLY (chat:ready, chat:error, chat:teardown)
 * - Custom element wraps iframe, reveals on 'chat:ready' message
 * - CSP: /chat/ has frame-ancestors 'self' to allow embedding
 */

import { ChatDockHost } from './ChatDockHost';

/**
 * Mounts chat iframe in custom element
 * Safe to call multiple times - will reuse existing host
 */
export function mountChatDock(): void {
  // Safety guard: prevent duplicate chat host creation
  if ((window as any).__LM_CHAT_HOST_CREATED__) {
    console.warn('[lm] duplicate chat host creation blocked');
    return;
  }
  (window as any).__LM_CHAT_HOST_CREATED__ = true;

  try {
    // 1) Ensure custom element is registered
    if (!customElements.get('lm-chatdock-host')) {
      customElements.define('lm-chatdock-host', ChatDockHost);
    }

    // 2) Get or create host element
    let host = document.querySelector('lm-chatdock-host') as HTMLElement | null;
    if (!host) {
      host = document.createElement('lm-chatdock-host');
      document.body.appendChild(host);
    }

    // 3) Attach shadow root once
    const sr = host.shadowRoot ?? host.attachShadow({ mode: 'open' });

    // 4) Add styles for host container (fixed, high-z box)
    let style = sr.querySelector('#lm-chat-host-styles') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'lm-chat-host-styles';
      style.textContent = `
        :host {
          position: fixed;
          right: 24px;
          bottom: 24px;
          width: 520px;
          height: 560px;
          z-index: 2147483000;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 18px 36px rgba(0,0,0,.5);
        }
        iframe {
          display: block;
          width: 100%;
          height: 100%;
          border: 0;
        }
      `;
      sr.appendChild(style);
    }

    // 5) Create iframe (sandboxed, same-origin for asset loading)
    let frame = sr.querySelector('#lm-chat-frame') as HTMLIFrameElement | null;
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'lm-chat-frame';

      // Add cache-busting build ID to iframe src
      const buildId = (globalThis as any).__RUNTIME_BUILD_ID__ ?? Date.now().toString();
      frame.src = `/chat/index.html?v=${buildId}`;

      frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-same-origin');
      frame.setAttribute('referrerpolicy', 'no-referrer');

      // Send init config when iframe loads
      frame.addEventListener('load', () => {
        frame!.contentWindow?.postMessage(
          { type: 'chat:init', config: {} },
          window.location.origin
        );
      });

      sr.appendChild(frame);
    }

    console.info('[chat] iframe host created');
  } catch (error) {
    console.error('[chat] host creation failed', error);
    sessionStorage.setItem('lm:disableChat', '1');
    delete (window as any).__LM_CHAT_HOST_CREATED__;
    throw error;
  }
}

/**
 * Unmounts chat (for cleanup if needed)
 */
export function unmountChatDock(): void {
  // Notify iframe to teardown
  const host = document.querySelector('lm-chatdock-host');
  const frame = host?.shadowRoot?.querySelector('#lm-chat-frame') as HTMLIFrameElement | null;

  frame?.contentWindow?.postMessage({ type: 'chat:teardown' }, window.location.origin);

  // Remove host element
  if (host) {
    host.remove();
  }

  delete (window as any).__LM_CHAT_HOST_CREATED__;

  console.info('[chat] host unmounted');
}
