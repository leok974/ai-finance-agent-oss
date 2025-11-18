import { test, expect } from '@playwright/test';

test('page can still scroll when chat panel is open @prod', async ({ page }) => {
  // Use /transactions which has guaranteed scrollable content
  await page.goto('/transactions');

  // Wait for page to be fully loaded
  await page.waitForLoadState('networkidle');

  // Check initial page height and scrollability
  const pageInfo = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    bodyOverflow: window.getComputedStyle(document.body).overflow,
    htmlOverflow: window.getComputedStyle(document.documentElement).overflow,
  }));

  console.log('Page info before opening chat:', pageInfo);

  // Ensure we start at the top
  await page.evaluate(() => window.scrollTo(0, 0));

  // Open chat via launcher bubble
  const bubble = page.getByTestId('lm-chat-launcher-button');
  await expect(bubble).toBeVisible();
  await bubble.click();

  // Confirm panel is open (shell visible)
  const shell = page.getByTestId('lm-chat-shell');
  await expect(shell).toBeVisible();

  // Check page properties after opening chat
  const pageInfoAfter = await page.evaluate(() => ({
    bodyOverflow: window.getComputedStyle(document.body).overflow,
    htmlOverflow: window.getComputedStyle(document.documentElement).overflow,
    bodyPosition: window.getComputedStyle(document.body).position,
  }));

  console.log('Page info after opening chat:', pageInfoAfter);

  // Try to scroll the main page while chat is open
  const targetScroll = Math.min(800, pageInfo.scrollHeight - pageInfo.clientHeight - 100);
  await page.evaluate((target) => window.scrollTo(0, target), targetScroll);
  
  // Wait a moment for scroll to complete
  await page.waitForTimeout(200);
  
  const scrollY = await page.evaluate(() => window.scrollY);

  console.log(`Target scroll: ${targetScroll}, Actual scrollY: ${scrollY}`);

  // Page should be able to scroll (even if not to full target due to content height)
  expect(scrollY).toBeGreaterThan(0);
});
