import { test, expect, Page } from '@playwright/test';
import { isEdgeLike, authBase } from '../utils/env';
import { logDevEnv } from '../utils/dev-env';

const email = `e2e-reset+${Date.now()}@example.com`;
const p1 = 'E2e!passw0rd';
const p2 = 'E2e!passw0rd#2';

async function csrf(page: Page) {
  await page.request.get(`${authBase()}/csrf`);
}

async function post(page: Page, url: string, data: Record<string, unknown>, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  headers['X-CSRF-Token'] = token ?? (await page.context().cookies()).find(c => c.name === 'csrf_token')?.value ?? '';
  const target = url.startsWith('http') ? url : `${authBase()}${url.replace(/^\/api\/auth/, '')}`;
  return page.request.post(target, { headers, data });
}

test('forgot → reset → login (skips if token API not available)', async ({ page }) => {
  test.skip(!isEdgeLike(), 'Reset password flow is edge-only; skipped in dev.');
  await logDevEnv(page, 'reset-password');
  await csrf(page);

  // prepare user (skip if register disabled)
  const r = await post(page, '/api/auth/register', { email, password: p1 });
  if (r.status() === 403) test.skip(true, 'registration disabled');

  // request reset
  const f = await post(page, '/api/auth/forgot-password', { email });
  if (!f.ok()) test.skip(true, `forgot-password not enabled (${f.status()})`);

  // obtain token (needs a dev/test endpoint or email capture; skip if missing)
  const tokResp = await page.request.get(`${authBase()}/dev/last-reset-token?email=${encodeURIComponent(email)}`);
  if (!tokResp.ok()) test.skip(true, 'no dev token endpoint; cannot validate reset flow');
  const { token } = await tokResp.json();

  // do reset
  const reset = await post(page, '/api/auth/reset-password', { token, new_password: p2 });
  expect([200, 204].includes(reset.status()), `reset failed ${reset.status()}`).toBeTruthy();

  // login with new password
  await csrf(page);
  const login = await post(page, '/api/auth/login', { email, password: p2 });
  expect(login.ok()).toBeTruthy();
  expect((await page.request.get(`${authBase()}/me`)).ok()).toBeTruthy();
});
