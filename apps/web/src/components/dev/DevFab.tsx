import React, { useCallback, useState, useEffect } from "react";
import { flags } from "@/lib/flags";
import { isDevUIEnabled, setDevUIEnabled } from "@/state/useDevUI";
import { emitToastSuccess } from "@/lib/toast-helpers";

export default function DevFab() {
  const [dev, setDev] = useState(isDevUIEnabled());
  useEffect(() => { setDev(isDevUIEnabled()); }, []);
  const toggle = useCallback(() => {
    const next = !isDevUIEnabled();
    setDevUIEnabled(next);
  try { emitToastSuccess?.(`Dev UI ${next ? 'enabled' : 'disabled'}`); } catch { /* toast optional */ }
    // also persist dock visibility consistent with legacy usage
    if (!next) localStorage.setItem('DEV_DOCK', '0');
    location.reload();
  }, []);
  if (!flags.dev && !dev) return null;
  return (
    <button
      onClick={toggle}
      title={dev ? "Disable Dev UI" : "Enable Dev UI"}
      className="
        fixed bottom-6 right-6 z-[60]
        h-11 w-11 rounded-full
        border border-white/10 bg-neutral-900/80
        backdrop-blur hover:bg-neutral-900
        shadow-lg
        inline-flex items-center justify-center
      "
    >
      <span className="sr-only">Dev UI Toggle</span>
      <div className={`h-2.5 w-2.5 rounded-full ${dev ? 'bg-emerald-400' : 'bg-gray-500'}`} />
    </button>
  );
}
