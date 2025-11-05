import { test, expect } from '@playwright/test';

// Minimal login + /auth/me smoke.
// Only runs when AUTH_SMOKE=1 is set in the environment.
// Env:
//   BASE_URL (default http://127.0.0.1)
//   EDGE_PORT (default 80)
//   AUTH_LOGIN_PATH (default /api/auth/login)
//   AUTH_EMAIL, AUTH_PASSWORD (required when AUTH_SMOKE=1)

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1';
const PORT = process.env.EDGE_PORT ?? '80';
const LOGIN_PATH = process.env.AUTH_LOGIN_PATH ?? '/api/auth/login';
const EMAIL = process.env.AUTH_EMAIL;
const PASSWORD = process.env.AUTH_PASSWORD;

test.describe.configure({ mode: 'serial' });

test.skip(process.env.AUTH_SMOKE !== '1', 'AUTH_SMOKE not enabled');

test('login + me returns 200', async ({ request }) => {
  if (!EMAIL || !PASSWORD) test.skip(true, 'AUTH_EMAIL or AUTH_PASSWORD not set');
  const base = `${BASE}:${PORT}`;

  const lr = await request.post(`${base}${LOGIN_PATH}`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(lr.ok(), `login failed: ${lr.status()}: ${await lr.text()}`).toBeTruthy();

  const me = await request.get(`${base}/api/auth/me`);
  expect(me.status(), await me.text()).toBe(200);
});
