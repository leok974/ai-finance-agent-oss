import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';
/**
 * Configure admin token via env in CI/dev:
 *   ADMIN_TOKEN=supersecret pnpm exec playwright test ...
 */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';

/**
 * E2E test for admin P2P backfill endpoint.
 *
 * Validates that:
 * 1. The endpoint is accessible with valid admin token
 * 2. Dry-run mode returns expected response structure
 * 3. Statistics are sane (matched <= analyzed, etc.)
 * 4. Sample merchants are provided
 */
test.describe('@prod @admin @p2p', () => {
  test('dry-run P2P backfill endpoint works and returns sane stats', async ({ request }) => {
    if (!ADMIN_TOKEN) {
      test.skip(true, 'ADMIN_TOKEN not set; skipping admin backfill test');
    }

    const url = `${BASE_URL}/admin/maintenance/backfill-p2p-transfers?dry_run=true`;
    const res = await request.post(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': ADMIN_TOKEN,
      },
    });

    expect(res.status(), 'backfill endpoint should return 200 OK').toBe(200);

    const body = await res.json();

    // Expected JSON shape from BackfillP2PResponse:
    // {
    //   "dry_run": true,
    //   "analyzed": 123,
    //   "matched": 7,
    //   "updated": 0,
    //   "sample_merchants": ["NOW Withdrawal → Zelle (p2p)", ...]
    // }
    expect(body).toHaveProperty('dry_run', true);

    // Basic sanity checks on statistics
    expect(typeof body.analyzed).toBe('number');
    expect(body.analyzed).toBeGreaterThanOrEqual(0);

    expect(typeof body.matched).toBe('number');
    expect(body.matched).toBeGreaterThanOrEqual(0);
    expect(body.matched).toBeLessThanOrEqual(body.analyzed);

    // In dry-run mode, updated should be 0
    expect(typeof body.updated).toBe('number');
    expect(body.updated).toBe(0);

    // Sample merchants should be an array
    expect(Array.isArray(body.sample_merchants)).toBe(true);

    if (body.matched > 0) {
      // If there were matches, sample_merchants should have entries
      expect(body.sample_merchants.length).toBeGreaterThan(0);

      // Verify sample merchants are strings
      for (const m of body.sample_merchants.slice(0, 5)) {
        expect(typeof m).toBe('string');
        expect(m.length).toBeGreaterThan(0);
      }
    }
  });

  test('dry-run with month filter returns filtered results', async ({ request }) => {
    if (!ADMIN_TOKEN) {
      test.skip(true, 'ADMIN_TOKEN not set; skipping admin backfill test');
    }

    // Filter to current month
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const url = `${BASE_URL}/admin/maintenance/backfill-p2p-transfers?dry_run=true&month=${currentMonth}`;

    const res = await request.post(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': ADMIN_TOKEN,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();

    // Should still have valid structure
    expect(body).toHaveProperty('dry_run', true);
    expect(typeof body.analyzed).toBe('number');
    expect(typeof body.matched).toBe('number');
    expect(body.updated).toBe(0);
  });

  test('invalid admin token returns 401', async ({ request }) => {
    const url = `${BASE_URL}/admin/maintenance/backfill-p2p-transfers?dry_run=true`;
    const res = await request.post(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': 'invalid-token-12345',
      },
    });

    expect(res.status()).toBe(401);
  });

  test('missing admin token returns 401', async ({ request }) => {
    const url = `${BASE_URL}/admin/maintenance/backfill-p2p-transfers?dry_run=true`;
    const res = await request.post(url, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(res.status()).toBe(401);
  });
});
