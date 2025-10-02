import React from 'react';
import { Card } from '@/components/ui/card';
import { FEATURES } from '@/config/featureFlags';

export default function SuggestionsPanel() {
  if (!FEATURES.suggestions) {
    return (
      <Card className="text-sm opacity-80">
        Rule suggestions are temporarily unavailable.
      </Card>
    );
  }
  // If re-enabled later, restore the real component behind the flag.
  return (
    <Card className="text-sm opacity-80">
      Rule suggestions are temporarily unavailable.
    </Card>
  );
}
