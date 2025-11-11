import { test } from '@playwright/test';

test('main page without chat parameter', async ({ page }) => {
  page.on('console', msg => console.log(`[browser] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => {
    console.error(`[browser] PAGE ERROR:`, err.message);
    console.error(`  at:`, err.stack?.split('\n')[0]);
  });

  console.log('[test] Loading main page WITHOUT ?chat=1...');
  await page.goto('https://app.ledger-mind.org');

  await page.waitForTimeout(5000);

  const hasError = await page.evaluate(() => !!(window as any).__appError);
  console.log(`[test] App has error: ${hasError}`);
});
