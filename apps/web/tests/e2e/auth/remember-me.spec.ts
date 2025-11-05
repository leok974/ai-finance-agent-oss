import { test, expect, Page, Browser } from '@playwright/test';
import { isEdgeLike, apiBase, apiRoot, authBase } from '../utils/env';
import { logDevEnv } from '../utils/dev-env';
import { skipIfCookieDomainMismatch } from '../utils/skip-if-cookie-mismatch';

const email = `e2e-remember+${Date.now()}@example.com`;
const password = 'E2e!passw0rd';

async function csrf(page: Page) {
  await page.request.get(`${authBase()}/csrf`);
}

async function post(page: Page, url: string, data: Record<string, unknown>) {
  const token = (await page.context().cookies()).find(c => c.name === 'csrf_token')?.value ?? '';
  const target = url.startsWith('http') ? url : `${authBase()}${url.replace(/^\/api\/auth/, '')}`;
  return page.request.post(target, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    data
  });
}

test('session persists via refresh token', async ({ page, browser }: { page: Page; browser: Browser }) => {
  test.skip(!isEdgeLike(), 'Remember-me spec is edge-only; skipped in dev.');
  await logDevEnv(page, 'remember-me');
  await skipIfCookieDomainMismatch(page, 'remember-me');
  await page.request.get(`${apiRoot()}/ready`);
  await csrf(page);

  // Ensure user exists:
  // 1) try dev seed route; if not enabled, 2) fallback to register; else skip cleanly
  const seed = await page.request.post(`${apiBase()}/dev/seed-user`, {
    headers: { 'Content-Type': 'application/json' }, data: { email, password }
  });
  if (seed.status() === 404) {
    const reg = await post(page, '/api/auth/register', { email, password });
    if (reg.status() === 403) test.skip(true, 'registration disabled and dev seed not enabled');
    if (!reg.ok() && reg.status() !== 409) test.skip(true, `cannot create user: ${reg.status()}`);
  } else {
    expect([200,201].includes(seed.status()), `seed-user failed ${seed.status()}`).toBeTruthy();
  }

  const login = await post(page, '/api/auth/login', { email, password });
  if (!login.ok()) {
    test.skip(true, `login failed: ${login.status()}`);
  }

  // initial /me=200
  const meCheck = await page.request.get(`${authBase()}/me`);
  if (!meCheck.ok()) {
    test.skip(true, `/me check failed: ${meCheck.status()}`);
  }
  expect(meCheck.ok()).toBeTruthy();

  // simulate a cold start: new context with storageState from current context
  const state = await page.context().storageState();
  const context2 = await browser.newContext({ storageState: state, baseURL: process.env.BASE_URL });
  const page2 = await context2.newPage();
  const me2 = await page2.request.get(`${authBase()}/me`);
  expect(me2.ok(), `after restore, /me=${me2.status()}`).toBeTruthy();

  // force refresh path
  const ref = await post(page2, '/api/auth/refresh', {});
  expect(ref.ok(), `/auth/refresh should not 403 (got ${ref.status()})`).toBeTruthy();
  const me3 = await page2.request.get(`${authBase()}/me`);
  expect(me3.ok()).toBeTruthy();

  await context2.close();
});
