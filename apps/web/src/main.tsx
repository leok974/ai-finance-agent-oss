import React from 'react'
import { ensureRoot } from './rootSingleton'
import './index.css'
import App from './App'
import { Toaster } from "@/components/ui/toaster";
import Providers from "@/components/Providers";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { initLocale } from '@/lib/i18n-persist';
import { ensurePortalRoot } from '@/lib/portal';
// Build metadata injected during Docker build (file created in Dockerfile)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - generated at build time
import buildStamp from './build-stamp.json';
import { version as reactVersion } from 'react';
import { version as reactDomVersion } from 'react-dom';
import { BUILD_STAMP } from "./buildStamp";

// ✅ Global error handlers to catch initialization failures
window.addEventListener('error', e =>
  console.error('[main-boot] onerror', e?.error ?? e?.message ?? e));
window.addEventListener('unhandledrejection', e =>
  console.error('[main-boot] unhandledrejection', e.reason ?? e));

// ✅ Prevent double mount if the bundle is executed twice
// (route-replace, OAuth popup shenanigans, duplicate script tag, etc.)
declare global { interface Window { __APP_MOUNTED__?: boolean } }
if (window.__APP_MOUNTED__) {
  throw new Error('Abort duplicate mount');
}
window.__APP_MOUNTED__ = true;

// 🚀 Build banner with clear MODE, BRANCH, COMMIT, BUILD_AT display
const MODE = import.meta.env.PROD ? "prod" : "dev";

// These are typically injected by Vite plugins / env vars.
const BRANCH =
  (import.meta.env.VITE_GIT_BRANCH as string | undefined) ?? "unknown";
const COMMIT =
  (import.meta.env.VITE_GIT_COMMIT as string | undefined) ?? "unknown";
const BUILD_AT =
  (import.meta.env.VITE_BUILD_AT as string | undefined) ??
  new Date().toISOString();

const BUILD_TAG = `${BRANCH}@${COMMIT}`;
const ICON = MODE === "prod" ? "🚀" : "🧪";

// Big, easy-to-spot banner
// Example: 🚀 LedgerMind Web  prod  main@7204f00  (2025-11-17T03:25:21Z)
// eslint-disable-next-line no-console
console.log(
  `%c${ICON} LedgerMind Web`,
  "font-weight:bold;font-size:13px;color:#4ade80",
  MODE,
  BUILD_TAG,
  `(${BUILD_AT})`,
);

// DevDiag structured logging helper (for console capture)
(window as any).__DEVLOG = (tag: string, data: unknown) =>
  console.log(`[devlog] ${tag}`, JSON.stringify(data, null, 2));

(() => {
  try {
    // Attach structured metadata for debugging & cache-bust influence
    (window as any).__LEDGERMIND_BUILD__ = {
      branch: __WEB_BRANCH__,
      commit: __WEB_COMMIT__,
      buildId: __WEB_BUILD_ID__,
      stamp: buildStamp,
    };
    const meta = document.createElement('meta');
    meta.name = 'x-ledgermind-build';
    meta.content = `${buildStamp.branch || 'unknown'}@${buildStamp.commit || 'unknown'}#${buildStamp.buildId || 'unknown'}`;
    document.head.appendChild(meta);
  } catch {
    // swallow
  }
})();

// Initialize locale (persisted or inferred) before app render
initLocale();

// Ensure portal root exists before mounting app
ensurePortalRoot();

// Set production flag on root element for CSS safety net
if (import.meta.env.PROD) {
  document.documentElement.setAttribute('data-prod', 'true');
}

const container = document.getElementById('root')!;

// 🛡️ HARD GUARD: We do NOT use SSR. If anything is inside #root
// (e.g., extension-injected DOM), clear it so React doesn't attempt
// hydration against foreign markup → React error #185 eliminated.
if (container.firstChild) {
  console.warn('[boot] clearing unexpected DOM from #root (extensions?)');
  container.replaceChildren(); // fast and safe
}

// StrictMode should ONLY run in development (it causes double-rendering)
const AppContent = (
  <AppErrorBoundary>
    <Providers>
      <App />
      <Toaster />
    </Providers>
  </AppErrorBoundary>
);

// ✅ Root singleton prevents double-mount even if this script runs twice
const root = ensureRoot(container);
root.render(
  import.meta.env.DEV ? (
    <React.StrictMode>{AppContent}</React.StrictMode>
  ) : (
    AppContent
  )
);

// Boot diagnostics - prove single mount + single React copy
console.info('[boot] react', reactVersion, 'react-dom', reactDomVersion);
console.info('[boot] root created at', (window as any).__ROOT_CREATED_AT__);
console.info('[boot] mount once flag', window.__APP_MOUNTED__);

if (import.meta.env.PROD) {
  console.info('[boot] React root mounted once (production mode)');
}

// Chat handshake listener (iframe architecture - no custom element wrapper)
if (!(window as any).__chatHandshakeBound) {
  const chatListener = (e: MessageEvent) => {
    if (e.origin !== location.origin) return;
    const iframe = document.querySelector('#lm-chat-iframe') as HTMLIFrameElement | null;
    if (!iframe) return;

    if (e.data?.type === 'chat:ready') {
      iframe.classList.add('ready');
      console.log('[chat-iframe] revealed (ready)');
      (window as any).__CHAT_READY_SEEN__ = true; // For e2e tests
    }
    if (e.data?.type === 'chat:error') {
      iframe.classList.remove('ready');
      console.warn('[chat-iframe] hidden (error)');
    }
    if (e.data?.type === 'chat:teardown') {
      iframe.classList.remove('ready');
      console.log('[chat-iframe] hidden (teardown)');
    }
  };
  window.addEventListener('message', chatListener);
  (window as any).__chatHandshakeBound = true;
}
