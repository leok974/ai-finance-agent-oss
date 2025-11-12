/**
 * mountChat.tsx - Chat iframe bootstrap (parent side)
 *
 * CRITICAL ARCHITECTURE:
 * - Iframe IS the panel (no wrapper, no clipping)
 * - NEVER uses display:none (opacity + pointerEvents only)
 * - Overlay armed in requestAnimationFrame to prevent same-click close
 * - Repositions on viewport changes (resize, scroll, zoom, keyboard)
 */

import { ensureChatLauncher } from './chatLauncher';

const Z_OVERLAY = 2147483645;
const Z_IFRAME = 2147483646;
const MARGIN = 24; // was 16 - increased for shadow breathing room
const SHADOW_PAD = 8; // account for box-shadow visual width
const MIN_W = 320,
  MIN_H = 320,
  PREF_W = 420,
  PREF_H = 560;

let isOpen = false;
let armedOutside = false;
let ifr: HTMLIFrameElement | null = null;
let overlayEl: HTMLDivElement | null = null;
let mounted = false;

function vvp() {
  const vv = (window as any).visualViewport;
  return {
    w: vv?.width ?? window.innerWidth,
    h: vv?.height ?? window.innerHeight,
    ox: vv?.offsetLeft ?? 0,
    oy: vv?.offsetTop ?? 0,
  };
}

function isDiag() {
  return new URLSearchParams(location.search).get('chat') === 'diag';
}

declare const __RUNTIME_BUILD_ID__: string;

type ChatInit = {
  apiBase: string;
  baseUrl: string;
  month?: string;
  diag?: boolean;
};

function postInit() {
  if (!ifr?.contentWindow) return;
  const cfg: ChatInit = {
    apiBase: '/api',
    baseUrl: location.origin,
    month: (window as any).__LM_MONTH__ ?? undefined,
    diag: ['diag', 'debug'].includes(new URLSearchParams(location.search).get('chat') ?? ''),
  };
  ifr.contentWindow.postMessage({ type: 'CHAT_INIT', payload: cfg }, location.origin);
}

export function ensureIframe() {
  if (ifr) return ifr;
  const el = document.createElement('iframe');
  el.id = 'lm-chat-iframe';
  el.dataset.testid = 'lm-chat-iframe';
  el.referrerPolicy = 'no-referrer';
  el.sandbox.add('allow-scripts');
  el.sandbox.add('allow-same-origin');
  el.sandbox.add('allow-forms');

  const buildId = __RUNTIME_BUILD_ID__;
  el.src = `/chat/index.html?v=${buildId}`;

  Object.assign(el.style, {
    position: 'fixed',
    left: '0px',
    top: '0px',
    width: `${PREF_W}px`,
    height: `${PREF_H}px`,
    zIndex: String(Z_IFRAME),
    border: '0',
    borderRadius: '12px',
    background: 'transparent',
    boxShadow: '0 10px 30px rgba(0,0,0,.45)',
    transformOrigin: 'right bottom',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 120ms ease-out',
  });

  el.addEventListener('load', () => {
    requestAnimationFrame(postInit);
  });

  document.body.appendChild(el);
  ifr = el;
  return el;
}

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  const el = document.createElement('div');
  el.id = 'lm-chat-overlay';
  el.setAttribute('data-testid', 'lm-chat-overlay');
  el.className = 'lm-chat-overlay';

  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(0,0,0,.35)',
    zIndex: String(Z_OVERLAY),
    opacity: '0',
    pointerEvents: 'none', // will be set to 'auto' when open
    transition: 'opacity 120ms ease-out',
  });

  el.addEventListener('click', () => {
    if (!isOpen) return;
    if (!armedOutside) return;
    if (isDiag()) return;
    closeChat();
  });

  el.addEventListener('transitionend', () => {
    if (!isOpen) {
      el.remove();
      overlayEl = null;
      document.documentElement.classList.remove('lm-chat-blur');
    }
  });

  document.body.appendChild(el);
  overlayEl = el;
  return el;
}

function styleIframeOpen(iframe: HTMLIFrameElement, rect: DOMRect) {
  Object.assign(iframe.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    zIndex: String(Z_IFRAME),
    borderRadius: '12px',
    border: '0',
    background: 'transparent',
    boxShadow: 'rgba(0,0,0,.45) 0 10px 30px',
    transformOrigin: 'right bottom',
    opacity: '1',
    pointerEvents: 'auto',
  } as CSSStyleDeclaration);
}

function styleIframeClosed(iframe: HTMLIFrameElement) {
  Object.assign(iframe.style, {
    opacity: '0',
    pointerEvents: 'none',
  } as CSSStyleDeclaration);
}

function clampRectNear(anchor: DOMRect) {
  const { w: vw, h: vh, ox, oy } = vvp();
  const W = Math.min(PREF_W, Math.max(0, vw - 2 * MARGIN - SHADOW_PAD));
  const H = Math.min(PREF_H, Math.max(0, vh - 2 * MARGIN - SHADOW_PAD));

  // Convert anchor to viewport-relative coordinates by subtracting offset
  const anchorRelativeRight = anchor.right - ox;
  const anchorRelativeTop = anchor.top - oy;

  // Clamp within viewport bounds (0 to vw, 0 to vh) with shadow padding
  const leftRelative = Math.min(Math.max(anchorRelativeRight - W, MARGIN), vw - W - MARGIN - SHADOW_PAD);
  const topRelative = Math.min(Math.max(anchorRelativeTop - H - 8, MARGIN), vh - H - MARGIN - SHADOW_PAD);

  // Convert back to page coordinates by adding offset
  return new DOMRect(leftRelative + ox, topRelative + oy, W, H);
}

function applyRect(iframe: HTMLIFrameElement, rect: DOMRect) {
  Object.assign(iframe.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    opacity: '1',
    pointerEvents: 'auto',
  } as CSSStyleDeclaration);
}

function showOverlay() {
  const el = ensureOverlay();
  el.style.opacity = '1';
  el.style.pointerEvents = 'auto';
  document.documentElement.classList.add('lm-chat-blur');
  armedOutside = false;
  requestAnimationFrame(() => (armedOutside = true));
}

export function openChatAt(launcherRect: DOMRect) {
  const iframe = ensureIframe();
  const rect = clampRectNear(launcherRect);
  applyRect(iframe, rect);

  // Ensure iframe is on top and receives events
  Object.assign(iframe.style, {
    zIndex: '2147483646',
    pointerEvents: 'auto',
  });

  const overlay = ensureOverlay();
  overlay.style.pointerEvents = 'auto'; // MUST be clickable to close
  overlay.style.zIndex = '2147483645';
  overlay.style.opacity = '1';
  document.documentElement.classList.add('lm-chat-blur');
  armedOutside = false;
  requestAnimationFrame(() => (armedOutside = true));

  isOpen = true;

  // Send config to iframe (in case it reloaded)
  requestAnimationFrame(postInit);

  // Keep it inside viewport on every change
  const reflow = () => applyRect(iframe, clampRectNear(launcherRect));
  window.addEventListener('resize', reflow);
  (window as any).visualViewport?.addEventListener('resize', reflow);
  (window as any).visualViewport?.addEventListener('scroll', reflow);

  // Store for cleanup on close
  (iframe as any).__reflow__ = reflow;

  // Last-resort bring-to-front guard (helps when something else adds an overlay)
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (t && t.id !== 'lm-chat-iframe' && t.getAttribute('data-testid') !== 'lm-chat-iframe') return;
    iframe.style.zIndex = '2147483647';
  }, { passive: true });
}

export function closeChat() {
  const iframe = ensureIframe();

  // Remove viewport listeners
  const reflow = (iframe as any).__reflow__;
  if (reflow) {
    window.removeEventListener('resize', reflow);
    (window as any).visualViewport?.removeEventListener('resize', reflow);
    (window as any).visualViewport?.removeEventListener('scroll', reflow);
    delete (iframe as any).__reflow__;
  }

  styleIframeClosed(iframe);
  if (overlayEl) {
    overlayEl.style.opacity = '0';
    overlayEl.style.pointerEvents = 'none';
  }
  isOpen = false;
}

export function ensureChatMounted() {
  if (mounted) return;
  mounted = true;

  const launcher = ensureChatLauncher(() => {
    const r = launcher.getBoundingClientRect();
    openChatAt(r);
  });

  ensureIframe();

  // Global Escape key handler
  window.addEventListener('keydown', (ev) => {
    if (!isOpen) return;
    if (ev.key !== 'Escape') return;
    if (isDiag()) return;
    closeChat();
  });

  // Backtick quick-open
  window.addEventListener('keydown', (ev) => {
    if (ev.key === '`' && !isOpen) {
      openChatAt(launcher.getBoundingClientRect());
    }
  });

  console.log('[mountChat] initialized');
}

(window as any).lmChat = {
  snapshot() {
    const iframe = ifr;
    if (!iframe) return { mounted: false };
    const s = iframe.style;
    const r = iframe.getBoundingClientRect();
    const vv = (window as any).visualViewport ?? {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    return {
      isOpen: isOpen,
      armedOutside,
      overlay: !!overlayEl,
      opacity: s.opacity,
      pe: s.pointerEvents,
      display: s.display,
      inside: r.x >= 0 && r.y >= 0 && r.right <= vv.width && r.bottom <= vv.height,
      style: {
        op: s.opacity,
        pe: s.pointerEvents,
        disp: s.display,
        vis: s.visibility,
        left: s.left,
        top: s.top,
        w: s.width,
        h: s.height,
      },
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      vp: { w: vv.width, h: vv.height },
    };
  },
  force(style: Partial<CSSStyleDeclaration>) {
    if (ifr) Object.assign(ifr.style, style);
  },
  // Quick manual check - paste in console
  check() {
    const iframe = document.querySelector('[data-testid="lm-chat-iframe"]') as HTMLElement | null;
    if (!iframe) return 'no iframe';
    const r = iframe.getBoundingClientRect();
    const vv = (window as any).visualViewport ?? { width: window.innerWidth, height: window.innerHeight };
    return {
      opacity: iframe.style.opacity,
      pe: iframe.style.pointerEvents,
      display: iframe.style.display,
      inside: r.x >= 0 && r.y >= 0 && r.right <= vv.width && r.bottom <= vv.height,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
      vp: { w: vv.width, h: vv.height },
    };
  },
};
