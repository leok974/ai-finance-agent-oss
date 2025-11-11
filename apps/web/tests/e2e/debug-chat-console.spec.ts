import { test } from '@playwright/test';

test('capture chat console logs from prod', async ({ page }) => {
  const logs: string[] = [];

  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', error => {
    logs.push(`[PAGE ERROR] ${error.message}`);
  });

  await page.goto('https://app.ledger-mind.org/?chat=1');

  // Wait for chat to mount or fail
  await page.waitForTimeout(5000);

  console.log('\n=== ALL CONSOLE LOGS ===');
  logs.forEach(log => console.log(log));

  const iframeCount = await page.locator('iframe[src*="chat"]').count();
  const hostCount = await page.locator('lm-chatdock-host').count();

  console.log(`\n=== CHAT STATE ===`);
  console.log(`Chat iframes: ${iframeCount}`);
  console.log(`Chat hosts: ${hostCount}`);

  if (hostCount > 0) {
    const hostClass = await page.locator('lm-chatdock-host').getAttribute('class');
    console.log(`Host classes: ${hostClass}`);
  }
});
