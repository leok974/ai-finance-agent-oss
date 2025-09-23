// Unified toast event emitter (single source of truth)
export type ToastAction = { label: string; onClick?: () => void };
export type ToastPayload = {
  title: string;
  description?: string;
  action?: ToastAction;
  variant?: 'success' | 'error' | 'info';
};

const EVENT = 'app:toast';

function dispatchToast(payload: ToastPayload) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: payload }));
}

export function emitToastSuccess(title: string, opts: Omit<ToastPayload, 'title' | 'variant'> = {}) {
  dispatchToast({ ...opts, title, variant: 'success' });
}
export function emitToastError(title: string, opts: Omit<ToastPayload, 'title' | 'variant'> = {}) {
  dispatchToast({ ...opts, title, variant: 'error' });
}

// Legacy shim (minimal) while refactoring old code paths can import { toast }
// Legacy helpers (toast shim, useOkErrToast, showToast) removed after migration.
