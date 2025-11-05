/**
 * E2E Test: Dev Endpoints Gating (Standalone)
 *
 * Runs independently without auth setup - tests that endpoints are properly gated.
 * Use this for CI runs that don't have full auth stack available.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost';

// Remove authentication requirement
test.use({ storageState: undefined });

test.describe('Dev Endpoints Gating (No Auth)', () => {
  test('auth/dev/status requires authentication in prod', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/auth/dev/status`);
    expect([401, 403]).toContain(response.status());
  });

  test('agent/dev/status is public but reports disabled in prod', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/agent/dev/status`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('enabled');
    expect(body.enabled).toBe(false);
  });

  test('agent/dev/enable requires bearer token', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/agent/dev/enable`);
    expect([401, 403]).toContain(response.status());
  });

  test('OpenAPI documents dev endpoints', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/openapi.json`);
    expect(response.ok()).toBeTruthy();

    const openapi = await response.json();
    const paths = Object.keys(openapi.paths);

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

  test('agent/dev/status does not leak secrets', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/agent/dev/status`);
    const body = await response.json();
    const bodyStr = JSON.stringify(body);

    expect(bodyStr).not.toMatch(/LM_DEV_ENABLE_TOKEN/);
    expect(bodyStr).not.toMatch(/LM_DEV_COOKIE_KEY/);
    expect(bodyStr).not.toMatch(/LM_DEV_SUPER_PIN/);
  });

  test('OpenAPI does not expose secret values', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/openapi.json`);
    const openapi = await response.json();
    const openapiStr = JSON.stringify(openapi);

    expect(openapiStr).not.toMatch(/LM_DEV_ENABLE_TOKEN/);
    expect(openapiStr).not.toMatch(/LM_DEV_COOKIE_KEY/);
    expect(openapiStr).not.toMatch(/LM_DEV_SUPER_PIN/);
  });
});
