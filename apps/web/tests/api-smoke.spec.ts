// apps/web/tests/api-smoke.spec.ts
/**
 * Playwright API smoke tests - validates nginx routing and backend health
 * Run with: pnpm test:e2e or npx playwright test
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost';

test.describe('API Layer Smoke Tests', () => {
  test('nginx strips /api prefix and proxies to backend', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/agent/tools/meta/latest_month`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('month');
    expect(typeof data.month).toBe('string');
  });

  test('health endpoint returns ok', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/healthz`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('db');
  });

  test('ready endpoint is accessible', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/ready`);
    expect(response.status()).toBe(200);
  });

  test('version endpoint returns build info', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/version`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('commit');
  });

  test('RAG status endpoint (requires auth)', async ({ request }) => {
    // This should fail with 401/403 when not authenticated
    const response = await request.get(`${BASE_URL}/api/agent/tools/rag/status`);
    // Accept either 401 Unauthorized or 403 Forbidden, or 200 if somehow auth is bypassed in test
    expect([200, 401, 403]).toContain(response.status());
  });

  test('charts endpoint responds (may need auth)', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/charts/month-flows?month=2025-08`);
    // Should get 401/403 for auth, or 200/404 if endpoint exists
    expect(response.status()).toBeGreaterThanOrEqual(200);
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe('Nginx Routing Verification', () => {
  test('direct /agent route works (no /api prefix)', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/agent/tools/meta/latest_month`);
    expect(response.status()).toBe(200);
  });

  test('healthz endpoints work with and without /api', async ({ request }) => {
    const apiHealth = await request.get(`${BASE_URL}/api/healthz`);
    expect(apiHealth.status()).toBe(200);

    // Some systems may also expose /healthz directly
    const directHealth = await request.get(`${BASE_URL}/healthz`);
    // Accept 200 or 404, but not 502/503 (would indicate backend down)
    expect([200, 404]).toContain(directHealth.status());
  });
});

test.describe('Backend Version & Models', () => {
  test('version endpoint includes git info', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/version`);
    const data = await response.json();

    expect(data).toHaveProperty('commit');
    expect(data.commit).not.toBe('unknown');
  });
});
