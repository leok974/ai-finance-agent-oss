import { test, expect } from '@playwright/test';

const IS_PROD = process.env.IS_PROD === 'true';
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5173';

test.describe('Chat Auth Handling (dev only)', () => {
  test.skip(IS_PROD, 'chat-auth-401 is dev-only; prod covers auth via backend tests and login flow');

  test('shows auth banner and disables send when unauthenticated', async ({ page, context }) => {
    // Start from a clean unauthenticated state
    await context.clearCookies();

    await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);

    // Chat auto-opens with ?chat=1
    const banner = page.getByTestId('chat-auth-banner');
    await expect(banner).toBeVisible({ timeout: 10000 });

    // ChatDock v2: send button is in direct DOM, not iframe
    const send = page.getByTestId('chat-send');
    await expect(send).toBeDisabled();
  });
});
