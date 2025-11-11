/**
 * Chat entry point with SAFE MODE support
 *
 * SAFE MODE (VITE_CHAT_SAFE_MODE=1):
 * Renders minimal "Hello" div with zero portals, zero Radix.
 * Use to prove iframe boots before re-enabling portal-heavy components.
 */

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

let mounted = false;

export function mountChatDock() {
  console.log('[entry] mountChatDock called, mounted =', mounted);
  console.log('[entry] stack trace:', new Error().stack);

  if (mounted) {
    console.warn('[chat] mount ignored — already mounted');
    return;
  }

  const container = document.getElementById('lm-chat-root') ?? (() => {
    const el = document.createElement('div');
    el.id = 'lm-chat-root';
    document.body.appendChild(el);
    return el;
  })();

  // Hard stop if ownerDocument isn't the iframe doc
  if (container.ownerDocument !== document) {
    console.error('[chat] root container wrong document');
    return;
  }

  const root = (window as any).__chatRoot ??= createRoot(container);
  console.log('[entry] createRoot obtained, __chatRoot exists =', !!(window as any).__chatRoot);
  console.log('[entry] root object:', root);
  console.log('[entry] safe mode =', import.meta.env.VITE_CHAT_SAFE_MODE);

  mounted = true;

  // SAFE MODE: no Radix, no portals, no toasts, just text.
  if (import.meta.env.VITE_CHAT_SAFE_MODE === '1') {
    console.log('[entry] rendering safe mode');
    root.render(
      createElement('div', {
        'data-chat-safe': '1',
        style: { padding: 12, color: '#10b981', fontWeight: 'bold' }
      }, 'Chat minimal boot OK')
    );
    console.log('[chat] SAFE MODE rendered');
    return;
  }

  // Normal boot (unchanged)
  console.log('[entry] importing main.tsx for full boot');
  import('./main').then(m => {
    console.log('[entry] main.tsx loaded, calling bootChat');
    m.bootChat?.(root);
  }).catch(err => {
    mounted = false; // allow retry on hard failure
    console.error('[chat] boot error', err);
  });
}
