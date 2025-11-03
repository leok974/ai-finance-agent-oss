/**
 * E2E Test: Dev Endpoints Gating
 *
 * Verifies that dev-only endpoints are properly gated based on APP_ENV:
 * - In prod: endpoints exist but return 401/403/404
 * - In dev: endpoints are accessible with proper authentication
 *
 * This test runs in CI to catch regressions.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost';
const LM_DEV_ENABLE_TOKEN = process.env.LM_DEV_ENABLE_TOKEN ?? '';

test.describe('Dev Endpoints Gating', () => {
  test('auth/dev/status requires authentication in prod', async ({ request }) => {
    // In production (APP_ENV=prod), this endpoint should require auth
    const response = await request.get(`${BASE_URL}/auth/dev/status`);

    // Should be gated (401 Unauthorized or 403 Forbidden)
    expect([401, 403]).toContain(response.status());
  });

  test('agent/dev/status is public but reports disabled in prod', async ({ request }) => {
    // This endpoint is public (no auth required) but should report overlay disabled
    const response = await request.get(`${BASE_URL}/agent/dev/status`);

    expect(response.ok()).toBeTruthy();
    const body = await response.json();

    // In prod, overlay should be disabled
    expect(body).toHaveProperty('enabled');
    expect(body.enabled).toBe(false);
    expect(body).toHaveProperty('cookie_present');
  });

  test('agent/dev/enable requires bearer token', async ({ request }) => {
    // Attempt to enable without token should fail
    const withoutToken = await request.get(`${BASE_URL}/agent/dev/enable`);
    expect([401, 403]).toContain(withoutToken.status());
  });

  // Optional: Enable this test when running in dev environment
  test.skip('agent/dev/enable works with valid token in dev', async ({ request }) => {
    if (!LM_DEV_ENABLE_TOKEN) {
      test.skip();
      return;
    }

    const response = await request.get(`${BASE_URL}/agent/dev/enable`, {
      headers: {
        'Authorization': `Bearer ${LM_DEV_ENABLE_TOKEN}`
      }
    });

    // In dev with valid token, should succeed
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('ok');
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty('enabled');
    expect(body.enabled).toBe(true);
  });

  test('OpenAPI documents dev endpoints', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/openapi.json`);
    expect(response.ok()).toBeTruthy();

    const openapi = await response.json();
    const paths = Object.keys(openapi.paths);

    // Verify dev endpoints are documented
    const devEndpoints = [
      '/auth/dev/status',
      '/auth/dev/unlock',
      '/auth/dev/lock',
      '/agent/dev/status',
      '/agent/dev/enable',
      '/agent/dev/disable'
    ];

    devEndpoints.forEach(endpoint => {
      expect(paths).toContain(endpoint);
    });
  });
});

test.describe('Security: No Secrets in Responses', () => {
  test('agent/dev/status does not leak secrets', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/agent/dev/status`);
    const body = await response.json();
    const bodyStr = JSON.stringify(body);

    // Should not contain any secret values
    expect(bodyStr).not.toMatch(/LM_DEV_ENABLE_TOKEN/);
    expect(bodyStr).not.toMatch(/LM_DEV_COOKIE_KEY/);
    expect(bodyStr).not.toMatch(/LM_DEV_SUPER_PIN/);
    expect(bodyStr).not.toMatch(/\d{6,8}/); // No PINs
  });

  test('OpenAPI does not expose secret values', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/openapi.json`);
    const openapi = await response.json();
    const openapiStr = JSON.stringify(openapi);

    // Should not contain environment variable names for secrets
    expect(openapiStr).not.toMatch(/LM_DEV_ENABLE_TOKEN/);
    expect(openapiStr).not.toMatch(/LM_DEV_COOKIE_KEY/);
    expect(openapiStr).not.toMatch(/LM_DEV_SUPER_PIN/);
  });
});
