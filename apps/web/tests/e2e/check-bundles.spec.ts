import { test } from '@playwright/test';

test('check what bundles are actually loaded', async ({ page }) => {
  page.on('console', msg => console.log(`[browser] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[browser] ERROR:`, err.message));

  await page.goto('https://app.ledger-mind.org/');
  await page.waitForTimeout(3000);

  const scripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script[src]')).map((s: any) => ({
      src: s.src,
      loaded: s.src ? 'yes' : 'no'
    }));
  });

  console.log('[test] Scripts loaded:');
  scripts.forEach(s => console.log(`  ${s.src}`));

  // Check vendor-misc specifically
  const vendorMisc = scripts.find(s => s.src.includes('vendor-misc'));
  console.log(`[test] vendor-misc:`, vendorMisc?.src || 'NOT FOUND');
});
