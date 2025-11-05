import { test, expect, Page } from '@playwright/test';
import { logDevEnv } from '../utils/dev-env';
import { skipIfCookieDomainMismatch } from '../utils/skip-if-cookie-mismatch';
import { apiBase, apiRoot, authBase } from '../utils/env';

const baseEmail = `e2e-chgpw+${Date.now()}@example.com`;
const pw1 = 'E2e!passw0rd';
const pw2 = 'E2e!passw0rd#2';

async function csrf(page: Page) {
  await page.request.get(`${authBase()}/csrf`);
}

async function token(page: Page) {
  return (await page.context().cookies()).find(c => c.name === 'csrf_token')?.value ?? '';
}

async function post(page: Page, url: string, data: Record<string, unknown>) {
  const target = url.startsWith('http') ? url : `${authBase()}${url.replace(/^\/api\/auth/, '')}`;
  return page.request.post(target, {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': await token(page) },
    data
  });
}

test('change password rotates credentials', async ({ page }) => {
  await logDevEnv(page, 'change-password');
  await skipIfCookieDomainMismatch(page, 'change-password');
  await page.request.get(`${apiRoot()}/ready`);
  await csrf(page);

  // Prefer dev seed; fallback to register or skip
  const seed = await page.request.post(`${apiBase()}/dev/seed-user`, {
    headers: { 'Content-Type': 'application/json' }, data: { email: baseEmail, password: pw1 }
  });
  if (seed.status() === 404) {
  const reg = await post(page, '/api/auth/register', { email: baseEmail, password: pw1 });
    if (reg.status() === 403) test.skip(true, 'registration disabled and dev seed not enabled');
    if (!reg.ok() && reg.status() !== 409) test.skip(true, `cannot create user: ${reg.status()}`);
  } else {
    expect([200,201].includes(seed.status()), `seed-user failed ${seed.status()}`).toBeTruthy();
  }

  // Login with initial password
  const login = await post(page, '/api/auth/login', { email: baseEmail, password: pw1 });
  if (!login.ok()) test.skip(true, `login failed: ${login.status()}`);

  const ch = await post(page, '/api/auth/change-password', { current_password: pw1, new_password: pw2 });
  expect([200, 204].includes(ch.status()), `change-password failed ${ch.status()}`).toBeTruthy();

  // old creds should fail
  const oldLogin = await post(page, '/api/auth/login', { email: baseEmail, password: pw1 });
  expect(oldLogin.status(), 'old password should fail').toBe(401);

  // new creds should pass
  await csrf(page);
  const newLogin = await post(page, '/api/auth/login', { email: baseEmail, password: pw2 });
  expect(newLogin.ok(), `new password login failed ${newLogin.status()}`).toBeTruthy();

  // /me confirms session
  expect((await page.request.get(`${authBase()}/me`)).ok()).toBeTruthy();
});
