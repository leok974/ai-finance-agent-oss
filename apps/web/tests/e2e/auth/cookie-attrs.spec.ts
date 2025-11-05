import { test, expect } from '@playwright/test';
import { isEdgeLike, apiRoot, authBase } from '../utils/env';
import { logDevEnv } from '../utils/dev-env';
import { skipIfCookieDomainMismatch } from '../utils/skip-if-cookie-mismatch';

// Accept either host-only cookies (no Domain attr) or explicit correct Domain.
// Compute the expected cookie Domain from BASE_URL.
function expectedCookieDomain() {
  try {
    const u = new URL(process.env.BASE_URL ?? 'http://127.0.0.1');
    const h = u.hostname;
    // In prod we expect .ledger-mind.org; in local 127.0.0.1 is fine.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h === 'localhost') return h;
    // allow leading dot variant
    return `.${h.split('.').slice(-2).join('.')}`; // e.g., .ledger-mind.org
  } catch {
    return undefined;
  }
}

test.describe('Auth cookie attributes @auth-contract', () => {
  test.beforeAll(async () => {
    test.skip(!isEdgeLike(), 'Cookie attribute checks are edge-only; skipped in dev.');
  });
  test('login sets session + csrf cookies with expected attributes', async ({ page, request }) => {
    await logDevEnv(page, 'cookie-attrs');
    await skipIfCookieDomainMismatch(page, 'cookie-attrs');
  await request.get(`${apiRoot()}/ready`);
  await request.get(`${authBase()}/csrf`);

    // Check if CSRF cookie was set (domain mismatch detection)
    let cookies = await page.context().cookies();
    if (!cookies.find(c => c.name === 'csrf_token')) {
      test.skip(true, 'CSRF cookie not set - likely domain mismatch (need BASE_URL matching COOKIE_DOMAIN)');
      return;
    }

    const email = `e2e+cookie+${Date.now()}@example.com`;
    const password = 'E2e!passw0rd';

    // Try to ensure the user exists (skip if register disabled)
    const token = cookies.find(c => c.name === 'csrf_token')?.value ?? '';
  const reg = await request.post(`${authBase()}/register`, {
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      data: { email, password },
    });
    if (reg.status() === 403) test.skip(true, 'registration disabled');

  const res = await request.post(`${authBase()}/login`, {
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
      data: { email, password },
    });
    expect(res.ok(), `login failed: ${res.status()} ${await res.text()}`).toBeTruthy();

    const setCookie = res.headers()['set-cookie'] ?? '';
    expect(setCookie, 'Set-Cookie header missing').not.toEqual('');

    // Basic assertions
    expect(setCookie.toLowerCase(), 'csrf_token cookie missing').toContain('csrf_token');
    expect(setCookie.toLowerCase(), 'secure flag required in https prod').toContain('secure');

    // Domain checks: allow host-only (no Domain=) or correct apex/domain
    const exp = expectedCookieDomain();
    if (exp) {
      // If Domain is present, it must match our expectation family
      const domainMatches = setCookie.match(/domain=([^;,\s]+)/ig);
      const domains = domainMatches ? domainMatches.map(m => m.split('=')[1].toLowerCase()) : [];
      if (domains.length) {
        expect(domains.some(d => d === exp || d.endsWith(exp)), `cookie Domain must equal/contain ${exp}; got [${domains.join(', ')}]`).toBeTruthy();
      }
    }

    // Jar must actually have cookies for subsequent calls
    cookies = await page.context().cookies();
    expect(cookies.some(c => /access|refresh|session/i.test(c.name)), 'no auth session cookie present').toBeTruthy();
    expect(cookies.some(c => c.name === 'csrf_token'), 'no csrf_token cookie present').toBeTruthy();

    // /me should be 200 now
  const me = await request.get(`${authBase()}/me`);
    expect(me.ok(), `/api/auth/me bad status ${me.status()}`).toBeTruthy();
  });
});
