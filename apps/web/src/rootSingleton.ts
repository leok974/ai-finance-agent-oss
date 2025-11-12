/**
 * Root singleton to prevent double-mount scenarios.
 * 
 * Survives route/auth flips where bundler might re-execute entry.
 * Ensures only ONE React root ever exists for the app.
 */

import { createRoot, type Root } from 'react-dom/client';

let root: Root | null = null;

export function ensureRoot(container: HTMLElement): Root {
  // Safety guard: prevent duplicate root creation
  if ((window as any).__LM_REACT_ROOT_CREATED__) {
    console.warn('[lm] duplicate root creation blocked');
    if (root) return root;
    throw new Error('Root singleton guard triggered but no root reference found');
  }
  
  if (!root) {
    (window as any).__LM_REACT_ROOT_CREATED__ = true;
    container.replaceChildren(); // extra safety - nuke any stale DOM
    root = createRoot(container);
    (window as any).__ROOT_CREATED_AT__ = Date.now();
  }
  return root;
}
