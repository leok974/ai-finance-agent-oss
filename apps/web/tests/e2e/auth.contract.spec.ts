/**
 * Auth Contract Spec - Minimal smoke tests to catch routing drift
 *
 * This spec runs fast contract checks against production endpoints:
 * 1. /api/auth/me never returns 404
 * 2. Login redirects to Google with PKCE
 * 3. Nginx debug headers present (routing verification)
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL!;
test.describe.configure({ mode: 'serial' });

test('auth routes exist & contract holds', async ({ request }) => {
  // /api/auth/me must not be 404 - this is the critical regression detector
  const me = await request.get(`${BASE}/api/auth/me`);
  expect([200, 401, 403]).toContain(me.status());

  // login must 302 -> Google with PKCE params
  const login = await request.get(`${BASE}/api/auth/google/login`, {
    maxRedirects: 0
  });
  expect(login.status()).toBe(302);

  const loc = login.headers()['location'] || '';
  expect(loc).toContain('https://accounts.google.com/o/oauth2/v2/auth');
  expect(loc).toContain('code_challenge_method=S256');
  expect(loc).toMatch(/state=.*&/);

  // nginx debug header present (routing guard)
  const xloc = login.headers()['x-ngx-loc'] || '';
  expect(xloc).toMatch(/google-prefix|auth-me-exact|api-catchall/);
});

test('/api/auth/me has correct routing header', async ({ request }) => {
  const me = await request.get(`${BASE}/api/auth/me`);
  const xloc = me.headers()['x-ngx-loc'] || '';

  // Should be routed through auth-me-exact location
  expect(xloc).toBe('auth-me-exact');
});

test('/api/auth/google/callback exists', async ({ request }) => {
  // Callback with invalid code should not 404
  const callback = await request.get(
    `${BASE}/api/auth/google/callback?code=INVALID&state=TEST`,
    { failOnStatusCode: false }
  );

  expect(callback.status()).not.toBe(404);

  // Should be routed through google-prefix location
  const xloc = callback.headers()['x-ngx-loc'] || '';
  expect(xloc).toBe('google-prefix');
});
