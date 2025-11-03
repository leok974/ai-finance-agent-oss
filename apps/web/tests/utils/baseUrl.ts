export function withForcedAnalytics(raw?: string): string {
  const base = raw ?? 'https://app.ledger-mind.org';
  try {
    const u = new URL(base);
    if (!u.searchParams.has('forceAnalytics')) {
      u.searchParams.set('forceAnalytics', '1');
    }
    return u.toString();
  } catch {
    const sep = base.includes('?') ? (base.endsWith('?') || base.endsWith('&') ? '' : '&') : '?';
    return `${base}${sep}forceAnalytics=1`;
  }
}
