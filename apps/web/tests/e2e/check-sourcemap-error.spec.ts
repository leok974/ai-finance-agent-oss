import { test, expect } from '@playwright/test';

test('capture error with sourcemap', async ({ page }) => {
  const errors: any[] = [];

  page.on('pageerror', error => {
    errors.push({
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    console.log('[PAGE ERROR]', error.message);
    console.log('[STACK]', error.stack);
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('[CONSOLE ERROR]', msg.text());
    }
  });

  await page.goto('https://app.ledger-mind.org/', {
    waitUntil: 'domcontentloaded',
    timeout: 10000
  });

  // Wait a bit for errors to fire
  await page.waitForTimeout(3000);

  if (errors.length > 0) {
    console.log('\n=== ERRORS FOUND ===');
    console.log(JSON.stringify(errors, null, 2));
  } else {
    console.log('\n=== NO ERRORS - APP LOADED SUCCESSFULLY ===');
  }

  // Check if app mounted
  const mounted = await page.evaluate(() => (window as any).__APP_MOUNTED__);
  console.log('App mounted:', mounted);
});
