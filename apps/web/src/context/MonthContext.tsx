// src/context/MonthContext.tsx
import React from "react";

export const MonthContext = React.createContext<{
  month: string;
  setMonth: (m: string) => void;
}>({ month: "", setMonth: () => {} });

export const useMonth = () => React.useContext(MonthContext);
