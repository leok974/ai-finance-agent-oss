import React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <TooltipProvider delayDuration={200}>
      {children}
    </TooltipProvider>
  );
};

export default Providers;
