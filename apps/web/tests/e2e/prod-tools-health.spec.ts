/**
 * @prod
 * Production smoke test for critical tool endpoints
 *
 * Tests that boot-critical endpoints return safe responses (200/401)
 * instead of 500 errors when called with empty/missing data.
 *
 * Requires: chromium-prod project with saved auth state
 * Run: pnpm exec playwright test --project=chromium-prod
 */

import { test, expect } from '@playwright/test';

test.describe('Production tool endpoints health @prod', () => {
  test('insights/expanded does not 500 on empty month', async ({ request, baseURL }) => {
    const month = '2025-11';

    const response = await request.post(`${baseURL}/agent/tools/insights/expanded`, {
      data: { month, large_limit: 10 },
      failOnStatusCode: false, // Don't throw on non-2xx
    });

    // Should return 200 (success with data or empty fallback) or 401 (auth required)
    // NEVER 500 (internal server error)
    expect([200, 401]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      // Backend should return safe empty structure on errors
      expect(body).toHaveProperty('month');
      expect(body).toHaveProperty('stats');
    }
  });

  test('analytics/forecast/cashflow does not 500 on empty data', async ({ request, baseURL }) => {
    const month = '2025-11';

    const response = await request.post(`${baseURL}/agent/tools/analytics/forecast/cashflow`, {
      data: { month, horizon: 3 },
      failOnStatusCode: false,
    });

    // Should return 200 (success with data or empty fallback) or 401 (auth required)
    // NEVER 500 (internal server error)
    expect([200, 401]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      // Backend should return safe empty structure on errors
      expect(body).toHaveProperty('series');
      expect(body).toHaveProperty('summary');
    }
  });

  test('boot-critical endpoints are accessible', async ({ request, baseURL }) => {
    // Test that essential endpoints respond (not necessarily with data)
    const endpoints = [
      '/agent/tools/insights/expanded',
      '/agent/tools/analytics/forecast/cashflow',
    ];

    for (const endpoint of endpoints) {
      const response = await request.post(`${baseURL}${endpoint}`, {
        data: { month: '2025-11' },
        failOnStatusCode: false,
      });

      // Endpoint should be accessible (200/401/403), not broken (404/500/502/503)
      expect(response.status()).toBeLessThan(500);
      expect(response.status()).not.toBe(404);
    }
  });
});
