import { test } from '@playwright/test';

test('force reload and check for errors', async ({ page, context }) => {
  // Clear all caches
  await context.clearCookies();

  page.on('console', msg => console.log(`[browser] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => {
    console.error(`[browser] PAGE ERROR:`, err.message);
  });

  console.log('[test] Loading with cache bypass...');

  // Navigate with cache-busting and no-cache headers
  await page.goto('https://app.ledger-mind.org/', {
    waitUntil: 'domcontentloaded'
  });

  // Force reload bypassing cache
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.waitForTimeout(8000);

  const appState = await page.evaluate(() => ({
    mounted: !!(window as any).__APP_MOUNTED__,
    authReady: !!(window as any).__authReady,
  }));

  console.log(`[test] App state:`, appState);

  // Check what bundle is loaded
  const bundles = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script[src]'));
    return scripts.map((s: any) => s.src).filter((src: string) => src.includes('main-'));
  });

  console.log(`[test] Loaded bundles:`, bundles);
});
