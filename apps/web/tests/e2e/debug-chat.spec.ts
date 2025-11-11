import { test, expect } from '@playwright/test';

test.describe('Debug Chat @prod', () => {
  test('capture all console logs and page state', async ({ page }) => {
    const consoleLogs: string[] = [];
    const errors: string[] = [];

    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    page.on('pageerror', (err) => {
      errors.push(`PAGE ERROR: ${err.message}`);
    });

    await page.goto('/?chat=1');
    await page.waitForTimeout(5000);

    console.log('\n=== ALL CONSOLE LOGS ===');
    consoleLogs.forEach(log => console.log(log));

    console.log('\n=== ERRORS ===');
    errors.forEach(err => console.log(err));

    console.log('\n=== PAGE TITLE ===');
    console.log(await page.title());

    console.log('\n=== APP MOUNTED ===');
    const appMounted = await page.evaluate(() => (window as any).__APP_MOUNTED__);
    console.log('__APP_MOUNTED__:', appMounted);

    console.log('\n=== AUTH STATE ===');
    const authReady = await page.evaluate(() => (window as any).__AUTH_READY__);
    const authOk = await page.evaluate(() => (window as any).__AUTH_OK__);
    console.log('__AUTH_READY__:', authReady);
    console.log('__AUTH_OK__:', authOk);

    console.log('\n=== CHAT HOST ELEMENT ===');
    const chatHost = await page.locator('lm-chatdock-host').count();
    console.log('lm-chatdock-host count:', chatHost);

    console.log('\n=== BODY HTML (first 500 chars) ===');
    const bodyHtml = await page.evaluate(() => document.body.innerHTML.substring(0, 500));
    console.log(bodyHtml);
  });
});
