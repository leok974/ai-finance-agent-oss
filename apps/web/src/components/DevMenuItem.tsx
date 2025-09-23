import { useDevUI, isDevUIEnabled, setDevUIEnabled } from "@/state/useDevUI";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Check, Wrench } from "lucide-react";
import * as React from "react";

export default function DevMenuItem() {
  const dev = useDevUI();

  const onToggle = React.useCallback(() => {
    const next = !isDevUIEnabled();
    setDevUIEnabled(next);
    location.reload();
  }, []);

  return (
    <DropdownMenuItem
      onClick={onToggle}
      className="cursor-pointer flex items-center gap-2"
      data-testid="menu-dev-toggle"
    >
      <Wrench className="h-4 w-4 opacity-70" />
      <span className="flex-1">{dev ? "Disable Dev UI" : "Enable Dev UI"}</span>
      {dev && <Check className="h-4 w-4 opacity-80" aria-hidden="true" />}
    </DropdownMenuItem>
  );
}
