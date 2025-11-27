import React, { createContext, useContext } from 'react';

/**
 * Demo Mode Context
 *
 * CRITICAL ARCHITECTURE NOTES:
 *
 * 1. Demo data isolation:
 *    - Demo transactions live under DEMO_USER_ID (backend constant)
 *    - Real user data lives under current_user.id
 *    - These NEVER mix - separate database rows
 *
 * 2. Demo mode toggle (lm:demoMode localStorage):
 *    - When "1": http.ts adds ?demo=1 (GET) or demo:true (POST body)
 *    - Backend receives demo param and queries DEMO_USER_ID instead of current user
 *    - Charts/data appear to "switch" but it's just changing which user_id to query
 *
 * 3. State synchronization:
 *    - enableDemo()/disableDemo() update BOTH localStorage AND React state
 *    - Components using this context re-render on changes
 *    - http.ts reads localStorage directly (isDemoModeActive())
 *    - NEW: disableDemoAsync() returns a Promise that resolves when state fully updates
 *      This eliminates race conditions - no more setTimeout hacks!
 *
 * 4. Data flow rules:
 *    - CSV upload: Auto-exit demo mode first (doUpload)
 *    - Demo seed: Seeds to DEMO_USER_ID, then enable demo mode
 *    - Reset: Clear demo data, disable demo mode, clear current user
 *
 * See tests/UploadCsv.reset.test.tsx for regression coverage.
 */

interface DemoModeContextValue {
  demoMode: boolean;
  enableDemo: () => void;
  disableDemo: () => void;
  disableDemoAsync: () => Promise<void>;
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
