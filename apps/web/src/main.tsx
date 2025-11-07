import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { Toaster } from "@/components/ui/toaster";
import Providers from "@/components/Providers";
import { initLocale } from '@/lib/i18n-persist';
// Build metadata injected during Docker build (file created in Dockerfile)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - generated at build time
import buildStamp from './build-stamp.json';

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

// Set production flag on root element for CSS safety net
if (import.meta.env.PROD) {
  document.documentElement.setAttribute('data-prod', 'true');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <App />
      <Toaster />
    </Providers>
  </React.StrictMode>
)
