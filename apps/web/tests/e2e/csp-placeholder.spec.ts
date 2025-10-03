import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1';
const EDGE_PORT = process.env.EDGE_PORT ?? '80';

// Guard test ensuring CSP placeholder never leaks to clients.
// Relies on nginx runtime CSP rendering removing __INLINE_SCRIPT_HASHES__ token when no inline scripts.

test('@edge csp has no placeholder', async ({ request }) => {
  const res = await request.get(`${BASE}:${EDGE_PORT}/`, { maxRedirects: 0 });
  expect(res.ok()).toBeTruthy();
  const csp = res.headers()['content-security-policy'] || '';
  expect(csp.includes('__INLINE_SCRIPT_HASHES__')).toBe(false);
});
