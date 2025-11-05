import { test, expect } from '@playwright/test';
import { baseUrl, joinUrl } from './utils/env';
const LOGIN_PATH = process.env.AUTH_LOGIN_PATH ?? '/api/auth/login';
const EMAIL = process.env.AUTH_EMAIL;
const PASSWORD = process.env.AUTH_PASSWORD;

test.describe.configure({ mode: 'serial' });

// Only run when explicitly enabled
test.skip(process.env.AUTH_E2E !== '1', 'AUTH_E2E not enabled');

test('auth flow → /api/auth/me 200', async ({ request }) => {
  test.slow();
  if (!EMAIL || !PASSWORD) test.skip(true, 'AUTH_EMAIL or AUTH_PASSWORD not set');
  const base = baseUrl;

  const lr = await request.post(joinUrl(base, LOGIN_PATH), {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(lr.ok(), `login failed: ${lr.status()}: ${await lr.text()}`).toBeTruthy();

  const me = await request.get(joinUrl(base, '/api/auth/me'));
  expect(me.status(), await me.text()).toBe(200);

  // Optional ingest smoke (ignore auth-specific errors if still gated)
  const ing = await request.post(joinUrl(base, '/ingest?replace=false'), { multipart: { file: { name: 'dummy.csv', mimeType: 'text/csv', buffer: Buffer.from('date,amount,merchant\n2024-01-01,12.34,Coffee\n') } } });
  expect([200, 202, 204, 409]).toContain(ing.status());
});
