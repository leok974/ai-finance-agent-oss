import { useContext } from 'react';
import { RuleSeedContext } from './useRuleSeed';

export function useRuleSeed() {
  const context = useContext(RuleSeedContext);
  if (!context) {
    throw new Error('useRuleSeed must be used within RuleSeedProvider');
  }
  return context;
}
