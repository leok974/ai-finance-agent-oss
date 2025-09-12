import { useToast } from "@/hooks/use-toast";

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
