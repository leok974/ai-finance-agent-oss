import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuCheckboxItem
} from "@/components/ui/dropdown-menu";
import { Wrench, FileText, Bug, Link2, RefreshCw } from "lucide-react";
import { agentPlanStatus } from "@/lib/api";
import DevMenuItem from "../DevMenuItem";
import React from "react";

export default function DevMenu() {
  const isDev = import.meta.env.MODE !== "production";
  if (!isDev) return null;

  const apiBase = (import.meta as any).env?.VITE_API_BASE || "";
  const [throttle, setThrottle] = React.useState<{ rate_per_min: number; capacity: number; tokens: number } | null>(null);
  const [open, setOpen] = React.useState(false);
  const [bypass, setBypass] = React.useState<boolean>(() => localStorage.getItem("planner:bypass") === "1");

  const loadStatus = React.useCallback(async () => {
    try {
      const r = await agentPlanStatus();
      setThrottle(r.throttle);
    } catch {
      setThrottle(null);
    }
  }, []);

  React.useEffect(() => {
    if (open) loadStatus();
  }, [open, loadStatus]);

  const onToggleBypass = (v: boolean) => {
    setBypass(v);
    localStorage.setItem("planner:bypass", v ? "1" : "0");
  };

  return (
  <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
  <Button className="gap-1" variant="pill-outline">
          <Wrench className="h-4 w-4" /> Dev
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => (window.location.hash = "#dev-plan") }>
          <FileText className="h-4 w-4 mr-2" /> Planner DevTool
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => (window.location.hash = "#dev-plan-apply") }>
          <FileText className="h-4 w-4 mr-2" /> Planner Apply Panel
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DevMenuItem />

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => window.open(`${apiBase}/agent/plan/debug?q=top%20merchants%20for%20July`, "_blank") }>
          <Bug className="h-4 w-4 mr-2" /> Plan Debug (GET)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.open(`${apiBase}/docs`, "_blank") }>
          <Link2 className="h-4 w-4 mr-2" /> Open Backend /docs
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <div className="px-2 py-1.5 text-xs opacity-70">
          Planner LLM throttle:
          <div className="mt-1">
            {throttle
              ? `${Math.floor(throttle.tokens)}/${throttle.capacity} tokens • ${throttle.rate_per_min}/min`
              : "—"}
          </div>
        </div>
        <DropdownMenuItem onClick={loadStatus}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh status
        </DropdownMenuItem>

        <DropdownMenuCheckboxItem
          checked={bypass}
          onCheckedChange={(v: boolean) => onToggleBypass(Boolean(v))}
        >
          Bypass planner throttle
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
