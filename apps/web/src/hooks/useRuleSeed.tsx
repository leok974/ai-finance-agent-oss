import React, { createContext, useContext, useState } from 'react';

export type RuleSeed = {
  merchant: string;
  description?: string;
  categorySlug?: string;
  txnId?: number;
};

type RuleSeedContextType = {
  ruleSeed: RuleSeed | null;
  setRuleSeed: (seed: RuleSeed | null) => void;
};

export const RuleSeedContext = createContext<RuleSeedContextType | undefined>(undefined);

export function RuleSeedProvider({ children }: { children: React.ReactNode }) {
  const [ruleSeed, setRuleSeed] = useState<RuleSeed | null>(null);

  return (
    <RuleSeedContext.Provider value={{ ruleSeed, setRuleSeed }}>
      {children}
    </RuleSeedContext.Provider>
  );
}
