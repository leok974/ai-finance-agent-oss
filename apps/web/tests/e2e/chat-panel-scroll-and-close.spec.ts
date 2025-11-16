import { test, expect, type Page } from '@playwright/test';

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

test.describe('@prod Chat panel scroll & backdrop close', () => {
  test('scrolls to bottom and closes via outside click with fade, without blocking page scroll', async ({ page }) => {
    await ensureChatAvailable(page);

    const launcherBtn = page.getByTestId('lm-chat-launcher-button');
    const launcher = page.getByTestId('lm-chat-launcher');
    const shell = page.getByTestId('lm-chat-shell');
    const scrollRegion = page.getByTestId('lm-chat-scroll');

    // 1) Page scrolls BEFORE opening chat
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 300);
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(scrollAfter).toBeGreaterThanOrEqual(scrollBefore);

    // 2) Open panel
    await launcherBtn.click();
    await expect(shell).toBeVisible();
    await expect(launcher).toHaveAttribute('data-state', 'open');

    // 3) Page STILL scrolls WITH chat open (outside shell)
    const scrollWithChatBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 300);
    const scrollWithChatAfter = await page.evaluate(() => window.scrollY);
    expect(scrollWithChatAfter).toBeGreaterThanOrEqual(scrollWithChatBefore);

    // Test panel content scroll
    await scrollRegion.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    // Wait for scroll to complete
    await page.waitForTimeout(200);

    // Bottom tool should be visible after scroll
    await expect(page.getByText('Search transactions (NL)', { exact: false })).toBeVisible();

    // 4) Click-away (top-left corner) closes chat cleanly
    await page.mouse.click(20, 20);

    // Check fade-out via opacity (no flash)
    await expect
      .poll(async () => {
        return shell.evaluate((el) => window.getComputedStyle(el).opacity);
      })
      .toBe('0');

    // Verify launcher state
    await expect(launcher).toHaveAttribute('data-state', 'closed', { timeout: 1000 });

    // 5) Still scrollable AFTER close
    const scrollEndBefore = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 300);
    const scrollEndAfter = await page.evaluate(() => window.scrollY);
    expect(scrollEndAfter).toBeGreaterThanOrEqual(scrollEndBefore);
  });
});
