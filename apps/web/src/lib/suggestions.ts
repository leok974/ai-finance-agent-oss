/**
 * Utility functions for working with categorization suggestions
 */

/**
 * Extract confidence percentage from a suggestion object.
 * Handles both 'score' and 'confidence' fields for API compatibility.
 *
 * @param suggestion - Suggestion object with either score or confidence field
 * @returns Confidence as integer percentage (0-100)
 */
export function getSuggestionConfidencePercent(
  suggestion: { score?: number; confidence?: number } | null | undefined
): number {
  if (!suggestion) return 0;

  // Prefer 'confidence' field if present, fallback to 'score'
  const value = suggestion.confidence ?? suggestion.score ?? 0;

  // Clamp to [0, 1] range and convert to percentage
  const clamped = Math.max(0, Math.min(1, value));
  return Math.round(clamped * 100);
}
