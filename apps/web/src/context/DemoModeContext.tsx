import React, { createContext, useContext } from 'react';

interface DemoModeContextValue {
  demoMode: boolean;
  enableDemo: () => void;
  disableDemo: () => void;
}

const DemoModeContext = createContext<DemoModeContextValue | undefined>(undefined);

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (!context) {
    throw new Error('useDemoMode must be used within DemoModeProvider');
  }
  return context;
}

export const DemoModeProvider: React.FC<{
  children: React.ReactNode;
  value: DemoModeContextValue;
}> = ({ children, value }) => {
  return <DemoModeContext.Provider value={value}>{children}</DemoModeContext.Provider>;
};
