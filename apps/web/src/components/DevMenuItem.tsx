import { useDevUI, isDevUIEnabled, setDevUIEnabled, setDevUIEnabledSoft } from "@/state/useDevUI";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Check, Wrench } from "lucide-react";
import * as React from "react";

export default function DevMenuItem() {
  const dev = useDevUI();

  const onToggle = React.useCallback((e: React.MouseEvent) => {
    const next = !isDevUIEnabled();
    if (e.altKey) {
      // Soft session-only toggle preview (no persistence, no reload)
      setDevUIEnabledSoft(next);
    } else {
      setDevUIEnabled(next);
    }
  }, []);

  return (
    <DropdownMenuItem
      onClick={onToggle}
      className="cursor-pointer flex items-center gap-2"
      data-testid="menu-dev-toggle"
      title="Toggle Dev UI (Alt+Click for soft session-only toggle)"
    >
      <Wrench className="h-4 w-4 opacity-70" />
      <span className="flex-1">{dev ? "Disable Dev UI" : "Enable Dev UI"}</span>
      {dev && <Check className="h-4 w-4 opacity-80" aria-hidden="true" />}
    </DropdownMenuItem>
  );
}
