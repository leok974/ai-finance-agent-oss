import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test('@prod-critical toggles tools panel inside chat shell', async ({ page }) => {
  // Navigate to the route that loads chat
  await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);

  // ChatDock v2: shell in direct DOM
  const shell = page.locator('[data-testid="lm-chat-shell"]');
  await expect(shell).toBeVisible();

  // The toggle button is in the main DOM now (no iframe)
  const toggle = page.getByTestId('chat-tools-toggle');
  await expect(toggle).toBeVisible();

  // Get initial state from shell (or appropriate element)
  const before = await shell.getAttribute('data-tools-open');

  // Click the toggle button (direct click, no iframe navigation)
  await toggle.click();

  // Wait for the attribute to change
  await expect
    .poll(async () => await shell.getAttribute('data-tools-open'))
    .not.toBe(before);
});
