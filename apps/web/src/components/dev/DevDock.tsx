import React, { useState } from "react";
import { flags } from "@/lib/flags";
import Card from "@/components/Card";
import { Button } from "@/components/ui/button";
// Adjust these to actual paths. Available components in repo:
// - RuleTesterPanel at src/components/RuleTesterPanel.tsx
// - MLStatusCard at src/components/MLStatusCard.tsx
import RuleTesterPanel from "@/components/RuleTesterPanel";
import MLStatusCard from "@/components/MLStatusCard";
import PlannerDevPanel from "@/components/dev/PlannerDevPanel";

export default function DevDock() {
  const [open, setOpen] = useState(
    typeof window !== "undefined" && localStorage.getItem("DEV_DOCK") !== "0"
  );
  if (!flags.dev) return null;
  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 space-y-3">
      <Card className="border-dashed p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-80">Developer Tools</div>
          <div className="space-x-2">
            <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
              {open ? "Hide" : "Show"}
            </Button>
          </div>
        </div>
    {open && (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              {/* Planner DevTool */}
              <PlannerDevPanel />
            </div>
            <div className="space-y-3">
              {/* Rule Tester + ML Selftest */}
              <RuleTesterPanel onChanged={() => { /* no-op */ }} />
              <MLStatusCard />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
