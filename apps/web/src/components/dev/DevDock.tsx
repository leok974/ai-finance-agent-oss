import React, { useState } from "react";
import { flags } from "@/lib/flags";
import RuleTesterPanel from "@/components/RuleTesterPanel";
import MLStatusCard from "@/components/MLStatusCard";
import PlannerDevPanel from "@/components/dev/PlannerDevPanel";

export default function DevDock() {
  const [open, setOpen] = useState(
    typeof window !== "undefined" && localStorage.getItem("DEV_DOCK") !== "0"
  );
  if (!flags.dev) return null;
  if (!open) return null;
  const close = () => { localStorage.setItem("DEV_DOCK", "0"); setOpen(false); };
  return (
    <div className="fixed inset-x-5 bottom-5 z-[59]">
      <div className="mx-auto max-w-6xl rounded-xl border border-white/10 bg-white/5 shadow-lg">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="text-sm font-medium opacity-80">Developer Tools</div>
          <button onClick={close} className="text-xs opacity-70 hover:opacity-100">Hide</button>
        </div>

        <div className="p-4">
          <div className="grid grid-cols-12 gap-4">
            <PlannerDevPanel className="col-span-12 lg:col-span-7" />
            <div className="col-span-12 lg:col-span-5">
              <RuleTesterPanel />
            </div>
            <div className="col-span-12">
              <MLStatusCard />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
