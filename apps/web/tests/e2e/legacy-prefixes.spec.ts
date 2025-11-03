import { test, expect } from '@playwright/test';
import { isEdgeLike } from './utils/env';

// Dedicated guard: fail fast if any request still uses legacy /api/(agent|ingest) prefixes.

test('no legacy /api agent|ingest prefixes', async ({ page }) => {
  test.skip(!isEdgeLike(), 'Legacy prefix scan is edge-only; skipped in dev.');
  const bad: string[] = [];
  page.on('request', req => {
    const u = req.url();
    if (/\/api\/(agent|ingest)\b/.test(u)) bad.push(u);
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  expect(bad, `legacy paths used:\n${bad.join('\n')}`).toHaveLength(0);
});
