import React from "react";
import { flags } from "@/lib/flags";

export default function DevFab() {
  if (!flags.dev) return null;
  return (
    <button
      title="Toggle Dev Dock (Ctrl+Shift+D also works)"
      onClick={() => {
        const v = localStorage.getItem("DEV_DOCK") === "1" ? "0" : "1";
        localStorage.setItem("DEV_DOCK", v);
        location.reload();
      }}
      className="fixed bottom-4 right-4 z-50 rounded-full border px-3 py-2 text-xs opacity-80 hover:opacity-100"
    >
      DEV
    </button>
  );
}
