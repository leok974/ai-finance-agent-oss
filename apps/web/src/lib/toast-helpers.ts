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
export const toast = {
  success: (message: string, opts?: any) => emitToastSuccess(opts?.title || message, { description: opts?.description, action: opts?.action }),
  error: (message: string, opts?: any) => emitToastError(opts?.title || 'Error', { description: message, action: opts?.action }),
};

// (Optional) Hook wrappers can be re-added if needed.
export function useOkErrToast() {
  return {
    ok: (description: string, title = 'Success') => emitToastSuccess(title, { description }),
    err: (description: string, title = 'Something went wrong') => emitToastError(title, { description }),
  };
}

// Optional convenience for non-component calls; uses browser alert as fallback.
export function showToast(message: string, opts?: { type?: 'success' | 'error' | 'info'; actionLabel?: string; onAction?: () => void }) {
  const variant = opts?.type === 'error' ? 'error' : opts?.type === 'success' ? 'success' : 'info';
  if (opts?.actionLabel) {
    emitToastSuccess(message, { description: opts?.actionLabel });
  } else if (variant === 'error') emitToastError(message); else emitToastSuccess(message);
}
