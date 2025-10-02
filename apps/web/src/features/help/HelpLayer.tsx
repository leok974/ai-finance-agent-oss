import { useEffect } from "react";

export default function HelpLayer({ active }: { active: boolean }) {
  useEffect(() => {
    document.documentElement.toggleAttribute("data-help", active);
    return () => {
      document.documentElement.removeAttribute("data-help");
    };
  }, [active]);

  if (!active) return null;

  return (
    <div
      id="help-overlay"
      className="fixed inset-0 z-[9500] pointer-events-none bg-black/45 backdrop-blur-[2px]"
      aria-hidden="true"
    />
  );
}
