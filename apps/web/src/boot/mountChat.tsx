/**
 * mountChat.tsx - Chat iframe bootstrap (parent side)
 * 
 * CRITICAL ARCHITECTURE:
 * - Chat runs in sandboxed iframe with same-origin access (for script loading)
 * - Sandbox restricts capabilities (no forms, no top nav, but allows scripts/popups)
 * - Iframe self-mounts via /chat/index.html → src/chat/main.tsx
 * - Communication via postMessage (chat:ready, chat:error, chat:teardown)
 * - Custom element wraps iframe, reveals on 'chat:ready' message
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

    // 4) Create iframe (sandboxed with same-origin for script loading)
    let frame = sr.querySelector('#lm-chat-frame') as HTMLIFrameElement | null;
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'lm-chat-frame';
      frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-same-origin');
      frame.src = '/chat/index.html'; // Iframe self-mounts
      frame.style.cssText =
        'background:transparent;border:0;display:block;position:fixed;inset:auto 24px 24px auto;width:420px;height:640px;z-index:2147483647;pointer-events:auto;';
      
      // Optional: send init config when iframe loads
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
