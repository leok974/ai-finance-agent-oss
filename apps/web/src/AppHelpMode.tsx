import React from "react";
import { useHelpMode } from "./help/useHelpMode";
import HelpPopover from "./help/HelpPopover";

export default function AppHelpMode() {
  const { active, setActive, current, setCurrent, getContent } = useHelpMode();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "?") setActive((a) => !a); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActive]);

  if (!active) return null;
  return (
    <>
      {current && (
        <HelpPopover rect={current.rect} entry={getContent(current.key)} onClose={() => setCurrent(null)} />
      )}
    </>
  );
}
