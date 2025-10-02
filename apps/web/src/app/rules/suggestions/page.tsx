"use client";
import { FEATURES } from '@/config/featureFlags';

export default function SuggestionsPage() {
  if (!FEATURES.suggestions) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Rule Suggestions</h1>
        <p className="text-sm text-gray-600">Rule suggestions are temporarily unavailable.</p>
      </div>
    );
  }
  // Placeholder if re-enabled later.
  return (
    <div className="p-6 text-sm text-gray-600">
      Rule suggestions are temporarily unavailable.
    </div>
  );
}
