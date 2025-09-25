import React from "react";
import { useHelpMode } from "./help/useHelpMode";
import HelpPopover from "./help/HelpPopover";
import { verifyHelpKeys } from "./help/devChecks";

export default function AppHelpMode() {
  const { active, setActive, current, setCurrent, getContent } = useHelpMode();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?") setActive((a) => !a);
      if (e.key === "Escape") setActive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActive]);

  React.useEffect(() => {
    if (active) {
      verifyHelpKeys();
    }
  }, [active]);

  if (!active) return null;
  return (
    <>
      <div aria-live="polite" className="sr-only">Help mode on — Tab to cycle highlighted items.</div>
      {current && (
        <HelpPopover rect={current.rect} entryKey={current.key} entry={getContent(current.key)} onClose={() => setCurrent(null)} />
      )}
    </>
  );
}
