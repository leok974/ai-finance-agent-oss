import { test, expect } from '@playwright/test';

const EMAIL = process.env.DEV_E2E_EMAIL || 'leoklemet.pa@gmail.com';
const PASSWORD = process.env.DEV_E2E_PASSWORD || 'Superleo3';
const STATE = 'tests/e2e/.auth/state.json';

test('login and save storage state', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // 1) Try to seed the user first via dev routes (if available)
  const seeded = await page.evaluate(async (creds) => {
    try {
      // Use /api/dev/* (Vite proxies this to backend /dev/*)
      // Check if dev routes are enabled
      const envRes = await fetch('/api/dev/env', { credentials: 'include' });
      if (!envRes.ok) return false;
      const info = await envRes.json();
      if (!info?.allow_dev_routes) return false;

      // Seed the user
      const seedRes = await fetch('/api/dev/seed-user', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: creds.email,
          password: creds.password,
          role: 'dev',
        }),
      });
      return seedRes.ok;
    } catch { return false; }
  }, { email: EMAIL, password: PASSWORD });

  console.log(`User seeding: ${seeded ? 'SUCCESS' : 'SKIPPED (may already exist or dev routes disabled)'}`);

  // 2) If already authenticated, save state and exit
  const meOk = await page.evaluate(async () => {
    try {
      // Use /api/auth/me (frontend proxies this to backend /auth/me)
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      return r.ok;
    } catch { return false; }
  });
  if (meOk) {
    console.log('Already authenticated, saving state');
    await page.context().storageState({ path: STATE });
    return;
  }

  // 3) Try UI login first (if a login button exists)
  const loginBtn = page.getByRole('button', { name: /sign in|log in/i });
  if (await loginBtn.isVisible().catch(() => false)) {
    console.log('Attempting UI login...');
    await loginBtn.click();
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
    console.log('UI login successful');
    await page.context().storageState({ path: STATE });
    return;
  }

  // 4) Programmatic login (in-page so cookies land in this context)
  console.log('Attempting programmatic login...');
  const result = await page.evaluate(async (creds) => {
    // If your CSRF is double-submit, the cookie is set on first fetch to same-origin page
    try {
      // optional priming fetch (GET) to set CSRF cookie if you require it
      await fetch('/', { credentials: 'include' });
      // try likely endpoints; adjust names if different in your BE
      const endpoints: Array<[string, { email: string; password: string }]> = [
        ['/api/auth/login', { email: creds.email, password: creds.password }],
      ];
      const results: string[] = [];
      for (const [path, body] of endpoints) {
        const r = await fetch(path, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        results.push(`${path}: status=${r.status}`);
        if (r.ok) {
          return { ok: true, logs: results };
        }
        // Log error details for debugging
        try {
          const errorBody = await r.text();
          results.push(`${path} error: ${errorBody.substring(0, 200)}`);
        } catch (e) {
          results.push(`${path}: could not read error body`);
        }
      }
      return { ok: false, logs: results };
    } catch (e) {
      return { ok: false, logs: [`Exception: ${e}`] };
    }
  }, { email: EMAIL, password: PASSWORD });

  console.log('Login results:', result.logs.join(' | '));
  if (!result.ok) throw new Error(`Programmatic login failed: ${result.logs.join('; ')}`);

  // Validate & persist
  const meOk2 = await page.evaluate(async () => {
    // Use /api/auth/me (frontend proxies this to backend /auth/me)
    const r = await fetch('/api/auth/me', { credentials: 'include' });
    return r.ok;
  });
  if (!meOk2) throw new Error('/api/auth/me still unauthenticated after login');
  console.log('Programmatic login validated, saving state');
  await page.context().storageState({ path: STATE });
});
