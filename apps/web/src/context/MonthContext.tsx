// src/context/MonthContext.tsx
import React from "react";

export type MonthCtx = { month: string; setMonth: (m: string) => void };
export const MonthContext = React.createContext<MonthCtx | null>(null);

export function useMonth() {
  const ctx = React.useContext(MonthContext);
  if (!ctx) throw new Error("MonthContext missing provider");
  return ctx;
}
