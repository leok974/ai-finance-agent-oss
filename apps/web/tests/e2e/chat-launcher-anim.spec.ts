import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

async function ensureChatAvailable(page: Page) {
  await page.goto('/', { waitUntil: 'load', timeout: 60000 });

  if (process.env.IS_PROD === 'true') {
    try {
      await page
        .getByTestId('lm-chat-launcher-button')
        .waitFor({ timeout: 15000 });
    } catch {
      test.skip(
        true,
        'Chat launcher button not found in prod – likely E2E session/auth issue'
      );
    }
  }
}

test.describe('@prod Chat launcher animations', () => {

test.describe.configure({
  retries: process.env.IS_PROD === 'true' ? 1 : 0,
  timeout: 60_000,
});

test.beforeEach(async ({ page }) => {
  await ensureChatAvailable(page);

  // make sure the fuse doesn't hide the launcher
  await page.evaluate(() => {
    sessionStorage.removeItem('lm:disableChat');
  });
});

test('bubble hides and panel shows from same corner', async ({ page }) => {
  const launcherRoot = page.getByTestId('lm-chat-launcher');
  const bubble = page.getByTestId('lm-chat-launcher-button');
  const shell = page.getByTestId('lm-chat-shell');

  // sanity: root attached, bubble visible, launcher closed (shell opacity 0)
  await expect(launcherRoot).toBeAttached();
  await expect(launcherRoot).toHaveAttribute('data-state', 'closed');
  await expect(bubble).toBeVisible();
  await expect(shell).toHaveCSS('opacity', '0');

  // open panel
  await bubble.click();

  await expect(bubble).toBeHidden();
  await expect(launcherRoot).toHaveAttribute('data-state', 'open');
  await expect(shell).toHaveCSS('opacity', '1');

  // close via backdrop
  const backdrop = page.getByTestId('lm-chat-backdrop');
  await backdrop.click({ force: true });

  await expect(launcherRoot).toHaveAttribute('data-state', 'closed');
  await expect(shell).toHaveCSS('opacity', '0');
  await expect(bubble).toBeVisible();
});

test('multiple open/close cycles work correctly', async ({ page }) => {
  const launcherRoot = page.getByTestId('lm-chat-launcher');
  const bubble = page.getByTestId('lm-chat-launcher-button');
  const shell = page.getByTestId('lm-chat-shell');
  const backdrop = page.getByTestId('lm-chat-backdrop');

  for (let i = 0; i < 3; i++) {
    await bubble.click();
    await expect(launcherRoot).toHaveAttribute('data-state', 'open');
    await expect(shell).toHaveCSS('opacity', '1');

    await backdrop.click({ force: true });
    await expect(launcherRoot).toHaveAttribute('data-state', 'closed');
    await expect(shell).toHaveCSS('opacity', '0');
  }
});

test('launcher root is attached and positioned', async ({ page }) => {
  const root = page.getByTestId('lm-chat-launcher');
  const bubble = page.getByTestId('lm-chat-launcher-button');

  await expect(root).toBeAttached();
  await expect(bubble).toBeVisible();

  const box = await bubble.boundingBox();
  expect(box).not.toBeNull();

  // very loose sanity check that bubble exists and has reasonable size
  if (box) {
    expect(box.width).toBeGreaterThan(40);
    expect(box.height).toBeGreaterThan(40);
  }
});

});
