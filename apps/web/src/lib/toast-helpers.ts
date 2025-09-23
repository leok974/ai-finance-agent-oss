import { useToast } from "@/hooks/use-toast";

// Lightweight success/error helpers for imperative usage inside components.
export const toast = {
  success: (msg: string, opts?: any) => {
    try {
      const g: any = (globalThis as any);
      const t = g?.__app_toast_success__ as undefined | ((m: string, o?: any) => void);
      if (t) return t(msg, opts);
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { variant: 'default', title: opts?.title || msg, description: opts?.description, action: opts?.action } }));
    }
    // Fallback: push via hook pattern if available later
    console.log("[toast] success", msg, opts);
  },
  error: (msg: string, opts?: any) => {
    try {
      const g: any = (globalThis as any);
      const t = g?.__app_toast_error__ as undefined | ((m: string, o?: any) => void);
      if (t) return t(msg, opts);
    } catch {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { variant: 'destructive', title: opts?.title || 'Error', description: msg, action: opts?.action } }));
    }
    console.error("[toast] error", msg, opts);
  },
};

// Event-based emit helpers (preferred going forward)
export function emitToast(type: 'success' | 'error', message: string, options?: any) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app:toast', { detail: { type, message, options, title: options?.title || message, description: options?.description, action: options?.action, variant: type === 'error' ? 'destructive' : 'default' } }))
  }
}
export const emitToastSuccess = (m: string, o?: any) => emitToast('success', m, o)
export const emitToastError = (m: string, o?: any) => emitToast('error', m, o)

export function useOkErrToast() {
  const { toast } = useToast();
  return {
    ok: (description: string, title = "Success") => toast({ title, description }),
    err: (description: string, title = "Something went wrong") =>
      toast({ title, description, variant: "destructive" }),
  };
}

// Optional convenience for non-component calls; uses browser alert as fallback.
export function showToast(
  message: string,
  opts?: { type?: "success" | "error" | "info"; title?: string; actionLabel?: string; onAction?: () => void | Promise<void> }
) {
  try {
    // If a custom global toast is wired elsewhere, call it
    const g: any = (globalThis as any);
    const t = g?.__app_toast__ as undefined | ((m: string, o?: any) => void);
    if (t) return t(message, opts);
  } catch {}
  // Fallback: console + alert for visibility
  if (opts?.type === "error") console.error(message);
  else console.log(message);
  if (typeof window !== "undefined") {
    const wantsAction = !!opts?.actionLabel && typeof opts?.onAction === 'function';
    if (wantsAction) {
      const yes = window.confirm(`${message}\n\nClick OK to ${opts!.actionLabel}.`);
      if (yes) {
        try { const p = opts!.onAction!(); if (p && typeof (p as any).then === 'function') (p as any).then(()=>{}).catch(()=>{}); } catch {}
      }
      return;
    }
    if (opts?.type === "error") alert(`Error: ${message}`);
    else alert(message);
  }
}
