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

// Track open/closed state
let isOpen = false;
let hostElement: HTMLElement | null = null;
let backdropElement: HTMLDivElement | null = null;

/**
 * Show chat with animation
 */
export function showChat(host?: HTMLElement): void {
  const h = host ?? hostElement;
  if (!h) return;
  
  h.style.display = "block";
  h.animate(
    [
      { transform: "translateY(20px)", opacity: "0" },
      { transform: "translateY(0)", opacity: "1" }
    ],
    { duration: 160, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" }
  );
  
  if (backdropElement) {
    backdropElement.style.display = "block";
  }
  
  // Lock body scroll
  document.documentElement.style.overflow = "hidden";
  
  isOpen = true;
  console.log('[chat] opened');
  
  // Focus composer in iframe after animation
  setTimeout(() => {
    const frame = h.shadowRoot?.querySelector('iframe') as HTMLIFrameElement | null;
    const input = frame?.contentDocument?.querySelector('.input') as HTMLInputElement | null;
    input?.focus();
  }, 180);
}

/**
 * Hide chat with animation
 */
export function hideChat(host?: HTMLElement): void {
  const h = host ?? hostElement;
  if (!h) return;
  
  const anim = h.animate(
    [
      { transform: "translateY(0)", opacity: "1" },
      { transform: "translateY(16px)", opacity: "0" }
    ],
    { duration: 140, easing: "cubic-bezier(.2,.7,.2,1)", fill: "forwards" }
  );
  
  anim.onfinish = () => {
    h.style.display = "none";
  };
  
  if (backdropElement) {
    backdropElement.style.display = "none";
  }
  
  // Restore body scroll
  document.documentElement.style.overflow = "";
  
  isOpen = false;
  console.log('[chat] closed');
}

/**
 * Toggle chat visibility
 */
export function toggleChat(host?: HTMLElement): void {
  if (isOpen) {
    hideChat(host);
  } else {
    showChat(host);
  }
}

/**
 * Get current open state
 */
export function isChatOpen(): boolean {
  return isOpen;
}

/**
 * Mounts chat iframe in custom element
 * Safe to call multiple times - will reuse existing host
 * Returns host element for show/hide control
 */
export function mountChatDock(): HTMLElement {
  // Safety guard: prevent duplicate chat host creation
  if ((window as any).__LM_CHAT_HOST_CREATED__) {
    console.warn('[lm] duplicate chat host creation blocked');
    return hostElement!;
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
    hostElement = host;

    // 3) Create backdrop (click to close)
    if (!backdropElement) {
      const backdrop = document.createElement("div");
      backdrop.id = "lm-chat-backdrop";
      Object.assign(backdrop.style, {
        position: "fixed",
        inset: "0",
        background: "rgba(0,0,0,.35)",
        backdropFilter: "blur(1.5px)",
        zIndex: "2147482998",
        display: "none",
      });
      backdrop.addEventListener("click", () => hideChat(host!));
      document.body.appendChild(backdrop);
      backdropElement = backdrop;
    }

    // 4) Attach shadow root once
    const sr = host.shadowRoot ?? host.attachShadow({ mode: 'open' });

    // 5) Add styles for host container (fixed, high-z box)
    let style = sr.querySelector('#lm-chat-host-styles') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = 'lm-chat-host-styles';
      style.textContent = `
        :host {
          position: fixed;
          right: 20px;
          bottom: 20px;
          width: min(520px, 92vw);
          height: min(620px, 84vh);
          z-index: 2147483000;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 22px 48px rgba(0,0,0,.55);
          display: none;
        }
        iframe {
          display: block;
          width: 100%;
          height: 100%;
          border: 0;
          contain: layout paint style size;
        }
      `;
      sr.appendChild(style);
    }

    // 6) Create iframe (sandboxed, same-origin for asset loading)
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

    // 7) Start hidden (launcher will show it)
    host.style.display = 'none';

    // 8) Listen for Escape key to close
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        hideChat(host!);
      }
    });

    console.info('[chat] iframe host created');
    return host;
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
