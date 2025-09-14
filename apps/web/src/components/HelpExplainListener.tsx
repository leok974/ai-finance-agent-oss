import * as React from "react";
import { useExplain } from "@/hooks/useExplain";

export default function HelpExplainListener() {
  const { explain } = useExplain();
  React.useEffect(() => {
    const h = (e: Event) => {
      const { key, month } = (e as CustomEvent).detail || {};
      if (key) explain(key, { month, withContext: true });
    };
    window.addEventListener("help-mode:explain", h as EventListener);
    return () => window.removeEventListener("help-mode:explain", h as EventListener);
  }, [explain]);
  return null;
}
