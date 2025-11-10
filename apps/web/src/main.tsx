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

// ✅ Prevent double mount if the bundle is executed twice
// (route-replace, OAuth popup shenanigans, duplicate script tag, etc.)
declare global { interface Window { __APP_MOUNTED__?: boolean } }
if (window.__APP_MOUNTED__) {
  throw new Error('Abort duplicate mount');
}
window.__APP_MOUNTED__ = true;

(() => {
  try {
    // Attach structured metadata for debugging & cache-bust influence
    (window as any).__LEDGERMIND_BUILD__ = {
      branch: (globalThis as any).__WEB_BRANCH__ ?? '__WEB_BRANCH__',
      commit: (globalThis as any).__WEB_COMMIT__ ?? '__WEB_COMMIT__',
      buildId: (globalThis as any).__WEB_BUILD_ID__ ?? '__WEB_BUILD_ID__',
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

// Chat handshake listener (debounced for HMR safety)
if (!(window as any).__chatHandshakeBound) {
  const chatListener = (e: MessageEvent) => {
    if (e.origin !== location.origin) return;
    const host = document.querySelector('lm-chatdock-host') as HTMLElement | null;
    if (!host) return;
    
    if (e.data?.type === 'chat:ready') {
      host.classList.add('ready');
      console.log('[chat-host] revealed (ready)');
    }
    if (e.data?.type === 'chat:error') {
      host.classList.remove('ready');
      console.warn('[chat-host] hidden (error)');
    }
    if (e.data?.type === 'chat:teardown') {
      host.classList.remove('ready');
      console.log('[chat-host] hidden (teardown)');
    }
  };
  window.addEventListener('message', chatListener);
  (window as any).__chatHandshakeBound = true;
}
