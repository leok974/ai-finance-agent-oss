import { test, expect } from '@playwright/test';

test('debug chat rendering', async ({ page }) => {
  // Enable console logging with full details
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    const location = msg.location();
    console.log(`[browser] ${type}: ${text}`);
    if (location.url) {
      console.log(`  at ${location.url}:${location.lineNumber}:${location.columnNumber}`);
    }
  });

  page.on('pageerror', err => {
    console.error(`[browser] PAGE ERROR:`, err.message);
    console.error(`  Stack:`, err.stack);
  });

  await page.goto('https://app.ledger-mind.org/?chat=1');

  // Wait a bit for auth and chat to initialize
  await page.waitForTimeout(8000);

  // Check if iframe exists
  const iframe = page.locator('lm-chatdock-host');
  const iframeExists = await iframe.count();
  console.log(`[test] lm-chatdock-host exists: ${iframeExists > 0}`);

  if (iframeExists > 0) {
    const shadowRoot = await iframe.evaluateHandle(el => el.shadowRoot);
    const iframeInShadow = await shadowRoot.evaluateHandle(root => root?.querySelector('iframe'));
    console.log(`[test] iframe in shadow root exists: ${!!iframeInShadow}`);

    if (iframeInShadow) {
      const iframeSrc = await iframeInShadow.evaluate((el: any) => el?.src);
      console.log(`[test] iframe src: ${iframeSrc}`);
    }
  }

  // Check main app state
  const appState = await page.evaluate(() => ({
    chatEnabled: (window as any).__chatEnabled,
    authReady: !!(window as any).__authReady,
    hasError: !!(window as any).__appError
  }));
  console.log(`[test] App state:`, appState);

  // Take screenshot
  await page.screenshot({ path: 'chat-debug.png', fullPage: true });
});
