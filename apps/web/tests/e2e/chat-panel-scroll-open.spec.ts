import { test, expect } from '@playwright/test';

test('@chat @prod page can scroll when chat panel is open', async ({ page }) => {
  // Go to the main dashboard page (where you actually see the bug)
  await page.goto('/');

  // Check if page is scrollable, if not make it scrollable
  const scrollInfo = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));

  if (scrollInfo.scrollHeight <= scrollInfo.clientHeight + 100) {
    // Add content to make page scrollable
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.id = 'test-scroll-spacer';
      spacer.style.height = '2000px';
      document.body.appendChild(spacer);
    });
  }

  // Make sure we're at the top
  await page.evaluate(() => window.scrollTo(0, 0));

  // Open chat
  const bubble = page.getByTestId('lm-chat-launcher-button');
  await expect(bubble).toBeVisible();
  await bubble.click();

  const shell = page.getByTestId('lm-chat-shell');
  await expect(shell).toBeVisible();

  // Try scrolling the main document while chat is open
  await page.evaluate(() => window.scrollTo(0, 800));
  const scrollY = await page.evaluate(() => window.scrollY);

  expect(scrollY).toBeGreaterThanOrEqual(800);
});
