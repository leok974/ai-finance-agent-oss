// Central legacy fetch guard. Neutralizes deprecated endpoints without throwing.
export const LEGACY_ENABLED = false;

export async function tryLegacy<T>(fn: () => Promise<T>): Promise<T | null> {
  if (!LEGACY_ENABLED) return null;
  try {
    return await fn();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('legacy call failed', e);
    return null;
  }
}
