import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface MLSuggestion {
  id: number;
  label: string;
  confidence: number;
  source: string;
  model_version?: string;
  reasons?: any[];
  accepted?: boolean;
}

interface SuggestionCardProps {
  suggestion: MLSuggestion;
  onAccepted?: (id: number) => void;
}

export function SuggestionCard({ suggestion, onAccepted }: SuggestionCardProps) {
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(!!suggestion.accepted);

  async function accept() {
    setBusy(true);
    try {
      const res = await fetch(`/ml/suggestions/${suggestion.id}/accept`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAccepted(true);
      onAccepted?.(suggestion.id);
    } catch (e) {
      console.error("Failed to accept suggestion:", e);
    } finally {
      setBusy(false);
    }
  }

  // Pretty-print reasons for tooltip
  const reasonsText = suggestion.reasons
    ? JSON.stringify(suggestion.reasons, null, 2)
    : "No reasons provided";

  // Mode chip colors
  const modeColors: Record<string, string> = {
    rule: "bg-blue-600/10 text-blue-400",
    model: "bg-purple-600/10 text-purple-400",
    ask: "bg-amber-600/10 text-amber-400",
  };

  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-card">
      <div className="flex items-center justify-between">
        <div className="font-medium">{suggestion.label}</div>
        <div className="text-sm opacity-70">
          {(suggestion.confidence * 100).toFixed(0)}%
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs">
        <span
          className={`px-2 py-0.5 rounded-full text-xs ${modeColors[suggestion.source] ?? "bg-muted text-foreground/60"}`}
        >
          {suggestion.source}
        </span>
        <span className="opacity-70">·</span>
        <span className="opacity-70" title={`Model version: ${suggestion.model_version ?? "n/a"}`}>
          {suggestion.model_version ?? "n/a"}
        </span>
      </div>

      <details className="mt-2 text-xs opacity-80">
        <summary className="cursor-pointer">View reasoning</summary>
        <pre className="mt-1 overflow-auto max-h-48">{JSON.stringify(suggestion.reasons ?? [], null, 2)}</pre>
      </details>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={accept} disabled={busy || accepted}>
          {accepted ? "Accepted ✓" : "Accept"}
        </Button>
      </div>
    </div>
  );
}
