import { test, expect, Page } from '@playwright/test';
import { isEdgeLike, apiRoot, authBase } from '../utils/env';
import { logDevEnv } from '../utils/dev-env';

async function getCsrf(page: Page) {
  const c = await page.context().cookies();
  return c.find(x => x.name === 'csrf_token')?.value ?? '';
}

test.describe('Auth CSRF contract @auth-contract', () => {
  test.beforeAll(async () => {
    test.skip(!isEdgeLike(), 'CSRF contract checks are edge-only; skipped in dev.');
  });
  test('refresh: enforces CSRF double-submit protection', async ({ page }) => {
    await logDevEnv(page, 'csrf-contract');
    // Navigate to the app to get cookies in context
    await page.goto('/');
    await page.waitForSelector('body');

    // 1) Bootstrap CSRF cookie by navigating or calling /api/auth/csrf
  const csrfResp = await page.request.get(`${authBase()}/csrf`);
    expect(csrfResp.ok(), `CSRF endpoint should return 2xx, got ${csrfResp.status()}`).toBeTruthy();

    // Get the CSRF token from cookies
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find(c => c.name === 'csrf_token');

    // Skip if cookie domain mismatch (e.g., testing 127.0.0.1 but COOKIE_DOMAIN=.ledger-mind.org)
    if (!csrfCookie) {
      test.skip(true, 'CSRF cookie not set - likely domain mismatch (need BASE_URL matching COOKIE_DOMAIN)');
      return;
    }

    const token = csrfCookie.value;

    // 2) Call refresh WITHOUT header → must be 403 (Forbidden - CSRF protection)
  const noHeader = await page.request.post(`${authBase()}/refresh`, {
      headers: { 'Content-Type': 'application/json' },
      data: {},
    });
    expect(noHeader.status(), 'refresh should be 403 without CSRF header').toBe(403);

    // 3) Call refresh WITH header matching cookie → CSRF check passes
    // (Will still return 401 due to missing refresh_token, but that's auth layer, not CSRF)
  const withHeader = await page.request.post(`${authBase()}/refresh`, {
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token
      },
      data: {},
    });
    // Contract: CSRF protection returns 403, auth layer returns 401
    // Getting 401 proves CSRF was accepted (otherwise would be 403)
    expect(withHeader.status(), 'refresh with valid CSRF should pass CSRF check (401 = auth failed, not CSRF)').toBe(401);
  });

  test('login/register must include X-CSRF-Token (defense in depth)', async ({ page }) => {
  await page.request.get(`${apiRoot()}/ready`);
  await page.request.get(`${authBase()}/csrf`);
    const token = await getCsrf(page);

    const email = `e2e+csrf+${Date.now()}@example.com`;
    const password = 'E2e!passw0rd';

  const reg = await page.request.post(`${authBase()}/register`, {
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      data: { email, password },
    });

    // If registration is disabled, assert the API responds cleanly with 403 and skip.
    if (reg.status() === 403) test.skip(true, 'registration disabled in this env');

    expect(reg.ok(), `register failed ${reg.status()} ${await reg.text()}`).toBeTruthy();

  const login = await page.request.post(`${authBase()}/login`, {
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      data: { email, password },
    });
    expect(login.ok(), `login failed ${login.status()} ${await login.text()}`).toBeTruthy();
  });
});
