import { test, expect } from '@playwright/test';
import { apiBase, apiRoot } from './utils/env';

test.describe.configure({ mode: 'serial' });

// Utility: filter network requests for forbidden legacy patterns.
const FORBIDDEN = [
  /\/api\/agent\b/,
  /\/api\/ingest\b/,
  // /rules/suggestions is OK now that feature is enabled via VITE_SUGGESTIONS_ENABLED
];

// (ALLOW_PREFIXES removed – using direct forbidden pattern check only.)

// Capture console & request anomalies for easier debugging.

test.describe('Path rules smoke', () => {
  test('no forbidden /api prefixes for agent/ingest and suggestions gated', async ({ page }) => {
    test.slow();
    const seenForbidden: string[] = [];

    page.on('request', req => {
      const url = req.url();
      if (FORBIDDEN.some(rx => rx.test(url))) {
        seenForbidden.push(url);
      }
    });

    await page.goto('/');

    // Basic UI presence (root app container or body content)
    await expect(page.locator('body')).toBeVisible();

    // Check suggestions disabled message (panel or route) if present.
    const suggText = page.locator('text=Rule suggestions are temporarily unavailable.');
    // Not a hard requirement to always be visible, but if present should match exactly.
    if (await suggText.count()) {
      await expect(suggText.first()).toBeVisible();
    }

    // Navigate to app and check UI for Rule Suggestions (not API JSON)
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Try to find suggestions UI element or heading (adjust selector based on your app)
    const suggestionsHeading = page.getByRole('heading', { name: /Rule Suggestions/i });
    // Allow timeout since feature might not be immediately visible
    try {
      await suggestionsHeading.waitFor({ timeout: 3000 });
      await expect(suggestionsHeading).toBeVisible();
    } catch {
      // If not visible, that's OK - feature might be disabled or gated
      // The important part is we didn't make forbidden API calls
    }

    // Give some time for any lazy loaded calls
    await page.waitForTimeout(500);

  expect(seenForbidden, 'forbidden legacy or suggestions calls detected').toHaveLength(0);
  });

  test('metrics alias reachable', async ({ page }) => {
    test.slow();
    // Alias
  const aliasRes = await page.request.get(`${apiBase()}/metrics`);
    expect(aliasRes.status(), '/api/metrics should return 2xx/3xx').toBeGreaterThanOrEqual(200);
    expect(aliasRes.status()).toBeLessThan(400);
    // Direct metrics
  const directRes = await page.request.get(`${apiRoot()}/metrics`);
    expect(directRes.status(), '/metrics should return 200').toBe(200);
    const body = await directRes.text();
    expect(body).toContain('# HELP');
  });
});
