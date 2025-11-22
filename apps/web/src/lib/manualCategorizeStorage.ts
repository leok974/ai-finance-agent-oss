/**
 * Centralized localStorage helpers for manual categorization history.
 *
 * Used by ExplainSignalDrawer (save), ManualCategorizeSettingsDrawer (load/clear),
 * and SettingsDrawer (pill display).
 */

export const LAST_MANUAL_CATEG_KEY = 'lm:lastManualCategorize';

export interface LastManualCategorizeSnapshot {
  scope: 'just_this' | 'same_merchant' | 'same_description';
  category_slug: string;
  category_label: string;
  affected_count: number;
  created_at: string; // ISO string
}

export function loadLastManualCategorizeSnapshot():
  | LastManualCategorizeSnapshot
  | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(LAST_MANUAL_CATEG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastManualCategorizeSnapshot;
    if (!parsed || typeof parsed.affected_count !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveLastManualCategorizeSnapshot(
  snapshot: LastManualCategorizeSnapshot
) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      LAST_MANUAL_CATEG_KEY,
      JSON.stringify(snapshot)
    );
  } catch {
    // ignore storage errors
  }
}

export function clearLastManualCategorizeSnapshot() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LAST_MANUAL_CATEG_KEY);
  } catch {
    // ignore
  }
}
