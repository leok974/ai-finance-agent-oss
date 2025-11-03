import { test, expect, Page } from '@playwright/test';

const EMAIL    = process.env.DEV_E2E_EMAIL     || 'leoklemet.pa@gmail.com';
const PASSWORD = process.env.DEV_E2E_PASSWORD  || 'Superleo3';
const PIN      = process.env.DEV_SUPERUSER_PIN || '946281';

/** Helpers **/
async function login(page: Page) {
  await page.goto(process.env.BASE_URL || '/');
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page.getByText(EMAIL)).toBeVisible({ timeout: 10000 });
}

async function unlockWithPin(page: Page) {
  await page.getByTestId('unlock-dev').click();
  await page.getByTestId('pin-input').fill(PIN);
  await page.getByTestId('pin-submit').click();
  await expect(page.getByText(/Dev mode unlocked/i)).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('rag-chips')).toBeVisible();
}

async function csrfFetch(page: Page, url: string, init: RequestInit = {}) {
  const status = await page.evaluate(async (args) => {
    const { url, initStr } = args;
    const init = JSON.parse(initStr);
    const getCookie = (n: string) =>
      document.cookie.split('; ').find(r => r.startsWith(n + '='))?.split('=')[1] || '';
    const csrf = getCookie('csrf_token');
    const headers: Record<string, string> = {
      'X-CSRF-Token': csrf || '1',
      ...init.headers
    };
    const res = await fetch(url, {
      method: init.method || 'POST',
      credentials: 'include',
      headers,
      body: init.body
    });
    return res.status;
  }, { url, initStr: JSON.stringify(init) });
  return status as number;
}

/** 1) Refresh-token rotation should preserve dev unlock **/
test('@backend Dev unlock persists across /auth/refresh (token rotation)', async ({ page }) => {
  await login(page);
  await unlockWithPin(page);
  // Force token rotation
  const st = await csrfFetch(page, '/auth/refresh', { method: 'POST' });
  expect(st).toBeGreaterThanOrEqual(200);
  expect(st).toBeLessThan(300);
  // After rotation + reload, dev tools still visible
  await page.reload();
  await expect(page.getByTestId('rag-chips')).toBeVisible();
});

/** 2) Multi-tab: locking in Tab A hides tools in Tab B after next request **/
test('@backend Lock in one tab hides tools in another after next request', async ({ context, page }) => {
  // Tab A
  await login(page);
  await unlockWithPin(page);
  await expect(page.getByTestId('rag-chips')).toBeVisible();

  // Tab B (same browser context = shared cookies/session)
  const tabB = await context.newPage();
  await tabB.goto(process.env.BASE_URL || '/');
  await expect(tabB.getByTestId('rag-chips')).toBeVisible();

  // Lock from Tab A via API (no UI dependency)
  const st = await csrfFetch(page, '/auth/dev/lock', { method: 'POST' });
  expect(st).toBeGreaterThanOrEqual(200);
  expect(st).toBeLessThan(300);

  // Tab B should lose dev tools after next request (reload)
  await tabB.reload();
  await expect(tabB.getByTestId('rag-chips')).toHaveCount(0);

  // (Optional) Prove dev-only route is blocked
  const seedStatus = await csrfFetch(tabB, '/agent/tools/rag/seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  expect([401, 403]).toContain(seedStatus);
});
