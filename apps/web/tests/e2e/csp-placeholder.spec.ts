import { test, expect } from '@playwright/test';
import { isEdgeLike, baseUrl, joinUrl } from './utils/env';

// Guard test ensuring CSP placeholder never leaks to clients.
// Relies on nginx runtime CSP rendering removing __INLINE_SCRIPT_HASHES__ token when no inline scripts.

test.describe('CSP headers', () => {
  test.beforeAll(async () => {
    test.skip(!isEdgeLike(), 'CSP spec is edge/preview-only; skipped in dev E2E.');
  });

  test('@edge csp has no placeholder', async ({ request }) => {
  const res = await request.get(joinUrl(baseUrl, '/'), { maxRedirects: 0 });
  expect(res.ok()).toBeTruthy();
  const csp = res.headers()['content-security-policy'] || '';
  expect(csp.includes('__INLINE_SCRIPT_HASHES__')).toBe(false);
  });
});
