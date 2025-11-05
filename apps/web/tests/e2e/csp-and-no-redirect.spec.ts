import { test, expect, request } from '@playwright/test';
import { isEdgeLike } from './utils/env';
test.describe.configure({ mode: 'parallel' });

/**
 * Base URL for the running edge/nginx.
 * Override in CI or locally if needed:
 *   BASE_URL=http://127.0.0.1:80 pnpm exec playwright test -g "CSP"
 */
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1';

/** Collapse whitespace and normalize dynamic sha256 hashes for stable snapshots. */
function normalizeCsp(csp: string): string {
  return csp
    .replace(/\s+/g, ' ')                            // collapse whitespace
    .replace(/sha256-[A-Za-z0-9+/=]+/g, 'sha256-<HASH>') // redact runtime hash
    .trim();
}

test.describe('Edge headers & POST behavior', () => {
  test.beforeAll(async () => {
    test.skip(!isEdgeLike(), 'Edge/CSP headers spec is edge/preview-only; skipped in dev E2E.');
  });
  test('CSP header is present and stable (normalized snapshot)', async () => {
    const ctx = await request.newContext();
    const res = await ctx.get(`${BASE_URL}/`, { ignoreHTTPSErrors: true });
    expect(res.status(), 'GET / should be 200').toBe(200);

  const headers = res.headers();
  const csp = (headers['content-security-policy'] || headers['Content-Security-Policy']) as string | undefined;
    expect(csp, 'CSP header must be present').toBeTruthy();

    const normalized = normalizeCsp(csp!);

    // Assert key directives exist (tight but portable)
    expect(normalized).toContain("default-src 'self'");
    expect(normalized).toContain("script-src 'self'");
    expect(normalized).toContain("img-src 'self'");
    expect(normalized).toContain("connect-src 'self'");

    // Snapshot the normalized CSP so drift (domains/directives) is caught,
    // while the inline script hash is redacted as <HASH>.
    expect(normalized).toMatchSnapshot('csp-header.normalized.txt');
  });

  test('POST /agent/tools/analytics/forecast/cashflow is not redirected and returns JSON', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/agent/tools/analytics/forecast/cashflow`, {
      data: { month: '2025-10', horizon: 2 },
      ignoreHTTPSErrors: true,
      // Do not automatically follow redirects so we can assert there are none.
      maxRedirects: 0,
    });

    // No 30x
    expect(res.status(), `Expected no redirect, got ${res.status()}`).toBeGreaterThanOrEqual(200);
    expect(res.status()).toBeLessThan(300);

    // Valid JSON body (structure may vary; we assert it parses)
    const body = await res.json();
    expect(typeof body).toBe('object');
  });

  test('legacy /api/agent/* path should NOT exist (no redirect shim)', async ({ request }) => {
    const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1';

    // We expect this path to be gone. It should NOT 30x (redirect) and ideally 404.
    const res = await request.post(
      `${BASE_URL}/api/agent/tools/analytics/forecast/cashflow`,
      {
        data: { month: '2025-10', horizon: 1 },
        ignoreHTTPSErrors: true,
        maxRedirects: 0, // detect any lingering 30x
      }
    );

    // If a shim is still present, you’d see 301/302/307/308 here.
    expect(
      res.status(),
      `Expected no redirect; remove the /api/agent/* shim. Got status ${res.status()}`
    ).not.toBeGreaterThanOrEqual(300);

    // Preferred outcome: 404 (route no longer exists). 405 is also acceptable if a catch-all blocks POSTs.
    expect([404, 405]).toContain(res.status());
  });
});
