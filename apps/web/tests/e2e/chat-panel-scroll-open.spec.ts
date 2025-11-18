import { test, expect } from '@playwright/test';

// @prod to run in chromium-prod, @chat to group with chat tests
test('@prod @chat page can scroll when chat panel is open', async ({ page }) => {
  await page.goto('/');

  // Ensure the page is tall enough to scroll, even if the real content is short
  await page.evaluate(() => {
    const existing = document.getElementById('chat-scroll-test-filler');
    if (!existing) {
      const filler = document.createElement('div');
      filler.id = 'chat-scroll-test-filler';
      filler.style.height = '2000px';
      filler.style.pointerEvents = 'none';
      document.body.appendChild(filler);
    }
    window.scrollTo(0, 0);
  });

  // Open chat
  const launcher = page.getByTestId('lm-chat-launcher-button');
  await expect(launcher).toBeVisible();
  await launcher.click();

  const shell = page.getByTestId('lm-chat-shell');
  await expect(shell).toBeVisible();

  // Now try to scroll the main document while chat is open
  await page.evaluate(() => window.scrollTo(0, 800));
  const scrollY = await page.evaluate(() => window.scrollY);

  expect(scrollY).toBeGreaterThanOrEqual(800);
});
