import { test, expect, request } from '@playwright/test';

const CANDIDATES = ['/api/auth/google/login', '/auth/google/login'];

test('at least one Google login endpoint exists', async () => {
  const base = process.env.BASE_URL || 'https://app.ledger-mind.org';
  const ctx = await request.newContext();
  const results = await Promise.all(CANDIDATES.map(async p => {
    const r = await ctx.get(base + p, { maxRedirects: 0 });
    return { path: p, status: r.status(), loc: r.headers()['location'] || '' };
  }));
  console.log('Auth endpoint check:', JSON.stringify(results, null, 2));
  
  // At least one endpoint should return 200 (success), 302 (redirect to OAuth), or 401 (unauthorized but exists)
  const validStatuses = results.filter(r => [200, 302, 308, 401].includes(r.status));
  expect(validStatuses.length).toBeGreaterThan(0);
});
