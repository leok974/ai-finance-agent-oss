import React from "react";
import { flags } from "@/lib/flags";

export default function DevFab() {
  if (!flags.dev) return null;
  const toggleDock = () => {
    const v = localStorage.getItem("DEV_DOCK") === "1" ? "0" : "1";
    localStorage.setItem("DEV_DOCK", v);
    location.reload();
  };
  return (
    <button
      onClick={toggleDock}
      title="Developer Tools"
      className="
        fixed bottom-6 right-6 z-[60]
        h-11 w-11 rounded-full
        border border-white/10 bg-neutral-900/80
        backdrop-blur hover:bg-neutral-900
        shadow-lg
        inline-flex items-center justify-center
      "
    >
      <span className="sr-only">Developer Tools</span>
      <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
    </button>
  );
}
