import { test, expect, Page } from '@playwright/test';
import { isEdgeLike, apiBase, authBase } from '../utils/env';
import { logDevEnv } from '../utils/dev-env';
import { skipIfCookieDomainMismatch } from '../utils/skip-if-cookie-mismatch';

const email = `e2e+${Date.now()}@example.com`;
const password = 'E2e!passw0rd';

async function ensureCsrf(page: Page) {
  await page.request.get(`${authBase()}/csrf`); // sets csrf_token cookie
}

function getCsrf(page: Page) {
  return page.context().cookies().then(c => c.find(x => x.name === 'csrf_token')?.value);
}

async function postWithCsrf(page: Page, url: string, data: Record<string, unknown>) {
  const token = await getCsrf(page);
  const full = url.startsWith('http') ? url : `${authBase()}${url.replace(/^\/api\/auth/, '')}`;
  return page.request.post(full, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token ?? '' },
    data,
  });
}

test.describe('Auth: register → login → me', () => {
  test.beforeAll(async () => {
    test.skip(!isEdgeLike(), 'Auth register/login spec is edge-only; skipped in dev.');
  });
  test('register works (or cleanly 403 if disabled), login sets cookies, /me=200', async ({ page }) => {
    await logDevEnv(page, 'register-login');
    await skipIfCookieDomainMismatch(page, 'register-login');
  await page.request.get(`${apiBase()}/ready`);

    // Bootstrap CSRF for safe POSTs
    await ensureCsrf(page);

    // Try to register
  const r = await postWithCsrf(page, '/register', { email, password });
    if (r.status() === 403) {
      const body = await r.text();
      test.skip(true, `registration disabled in env (403): ${body.slice(0, 120)}`);
    }
    expect(r.ok(), `register failed: ${r.status()} ${await r.text()}`).toBeTruthy();

    // Login
  const login = await postWithCsrf(page, '/login', { email, password });
    expect(login.ok(), `login failed: ${login.status()} ${await login.text()}`).toBeTruthy();

    // Cookies must exist
    const jar = await page.context().cookies();
    const hasSession = jar.some(c => /access|refresh|session/i.test(c.name));
    const hasCsrf = jar.some(c => c.name === 'csrf_token');
    expect(hasSession, 'no auth session cookie after login').toBeTruthy();
    expect(hasCsrf, 'no csrf_token cookie after login').toBeTruthy();

    // /me must be 200
  const me = await page.request.get(`${authBase()}/me`);
    expect(me.ok(), `/api/auth/me bad status ${me.status()}`).toBeTruthy();
  });
});
