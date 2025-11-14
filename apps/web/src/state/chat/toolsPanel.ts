/**
 * Chat tools panel visibility state
 *
 * Single source of truth for tools panel visibility.
 * No duplicate state - all components subscribe to this store.
 */

type Listener = (open: boolean) => void;

let open = true;
const listeners = new Set<Listener>();

export function getToolsOpen(): boolean {
  return open;
}

function setToolsOpen(next: boolean): void {
  if (next === open) return;
  open = next;
  for (const l of listeners) l(open);
}

export function showTools(): void {
  setToolsOpen(true);
}

export function hideTools(): void {
  setToolsOpen(false);
}

export function toggleTools(): void {
  setToolsOpen(!open);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // sync immediately
  listener(open);
  return () => {
    listeners.delete(listener);
  };
}
