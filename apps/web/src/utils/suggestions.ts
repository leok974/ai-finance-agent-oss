// mergeSuggestions:
// Combine model + gateway suggestion arrays with case-insensitive, trimmed de-duplication.
// Keeps original casing of the first occurrence.
export function mergeSuggestions(...lists: (string[] | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const raw of list) {
      const s = (raw ?? '').trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}
