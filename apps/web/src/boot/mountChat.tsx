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
const MARGIN = 16;
const MIN_W = 320,
  MIN_H = 320,
  PREF_W = 420,
  PREF_H = 560;

let armedOutside = false;
let ifr: HTMLIFrameElement | null = null;
let overlayEl: HTMLDivElement | null = null;
let mounted = false;

interface ChatState {
  isOpen: boolean;
}
const state: ChatState = { isOpen: false };

function getState() { return state; }
function setState(s: Partial<ChatState>) { Object.assign(state, s); }

function vv() {
  const v = (window as any).visualViewport;
  return v
    ? { x: v.offsetLeft || 0, y: v.offsetTop || 0, w: v.width, h: v.height }
    : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
}

function isDiag() {
  return new URLSearchParams(location.search).get('chat') === 'diag';
}

declare const __RUNTIME_BUILD_ID__: string;

export function ensureIframe() {
  if (ifr) return ifr;
  const el = document.createElement('iframe');
  el.id = 'lm-chat-iframe';
  el.dataset.testid = 'lm-chat-iframe';
  el.referrerPolicy = 'no-referrer';
  el.sandbox.add('allow-scripts');
  el.sandbox.add('allow-same-origin');

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
    el.contentWindow?.postMessage({ type: 'chat:init', config: {} }, window.location.origin);
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
    pointerEvents: 'none',
    transition: 'opacity 120ms ease-out',
  });

  el.addEventListener('click', () => {
    if (!armedOutside) return;
    if (isDiag()) return;
    closeChat();
  });

  el.addEventListener('transitionend', () => {
    if (!getState().isOpen) {
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

function showOverlay() {
  const el = ensureOverlay();
  el.style.opacity = '1';
  el.style.pointerEvents = 'auto';
  document.documentElement.classList.add('lm-chat-blur');
  armedOutside = false;
  requestAnimationFrame(() => (armedOutside = true));
}

export function openChatAt(launcherRect: DOMRect) {
  const off = vv();
  const vw = Math.min(window.innerWidth, off.w);
  const vh = Math.min(window.innerHeight, off.h);

  const W = Math.min(PREF_W, vw - MARGIN * 2);
  const H = Math.min(PREF_H, vh - MARGIN * 2);

  const left = Math.min(Math.max(launcherRect.right - W, MARGIN), vw - W - MARGIN) + off.x;
  const top = Math.min(Math.max(launcherRect.top - H - 8, MARGIN), vh - H - MARGIN) + off.y;

  const rect = new DOMRect(left, top, W, H);
  styleIframeOpen(ensureIframe(), rect);
  showOverlay();
  setState({ isOpen: true });
}

export function closeChat() {
  const iframe = ensureIframe();
  styleIframeClosed(iframe);
  if (overlayEl) {
    overlayEl.style.opacity = '0';
    overlayEl.style.pointerEvents = 'none';
  }
  setState({ isOpen: false });
}

function anchorToLauncher() {
  if (!state.isOpen) return;
  const launcher = document.querySelector<HTMLElement>('[data-testid="lm-chat-bubble"]');
  if (!launcher) return;
  const r = launcher.getBoundingClientRect();
  openChatAt(r);
}

export function ensureChatMounted() {
  if (mounted) return;
  mounted = true;

  const launcher = ensureChatLauncher(() => {
    const r = launcher.getBoundingClientRect();
    openChatAt(r);
  });

  ensureIframe();

  const vvp = (window as any).visualViewport;
  if (vvp) {
    vvp.addEventListener('resize', anchorToLauncher);
    vvp.addEventListener('scroll', anchorToLauncher);
  }
  window.addEventListener('resize', anchorToLauncher);

  window.addEventListener('keydown', (ev) => {
    if (ev.key === '`' && !state.isOpen) {
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
    return {
      isOpen: state.isOpen,
      armedOutside,
      overlay: !!overlayEl,
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
      vp: { w: window.innerWidth, h: window.innerHeight },
    };
  },
  force(style: Partial<CSSStyleDeclaration>) {
    if (ifr) Object.assign(ifr.style, style);
  },
};
