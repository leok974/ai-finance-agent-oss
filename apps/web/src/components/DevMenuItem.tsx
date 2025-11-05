import { useDevUI, isDevUIEnabled, setDevUIEnabled, setDevUIEnabledSoft, useDevUISoftStatus } from "@/state/useDevUI";
import { emitToastSuccess } from "@/lib/toast-helpers";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Check, Wrench } from "lucide-react";
import * as React from "react";

export default function DevMenuItem() {
  const dev = useDevUI();
  const { soft } = useDevUISoftStatus();

  const onToggle = React.useCallback((e: React.MouseEvent) => {
    const next = !isDevUIEnabled();
    if (e.altKey) {
      setDevUIEnabledSoft(next);
  try { emitToastSuccess?.(`Dev UI (soft) ${next ? 'on' : 'off'}`); } catch { /* toast optional */ }
    } else {
      setDevUIEnabled(next);
  try { emitToastSuccess?.(`Dev UI ${next ? 'enabled' : 'disabled'}`); } catch { /* toast optional */ }
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
  <span className="flex-1">{dev ? (soft ? "Disable Dev UI (soft)" : "Disable Dev UI") : "Enable Dev UI"}</span>
      {dev && <Check className="h-4 w-4 opacity-80" aria-hidden="true" />}
    </DropdownMenuItem>
  );
}
