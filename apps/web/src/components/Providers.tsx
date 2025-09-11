import React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/state/auth";

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      <TooltipProvider delayDuration={200}>
        {children}
      </TooltipProvider>
    </AuthProvider>
  );
};

export default Providers;
