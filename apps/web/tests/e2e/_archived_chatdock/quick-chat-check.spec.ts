import { test, expect } from '@playwright/test';

test('check chat rendering on prod', async ({ page }) => {
  const logs: string[] = [];

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('chat') || text.includes('portal') || text.includes('React') || text.includes('Error')) {
      logs.push(text);
    }
  });

  await page.goto('https://app.ledger-mind.org/?chat=1');
  await page.waitForTimeout(3000);

  console.log('=== CHAT LOGS ===');
  logs.forEach(log => console.log(log));

  const iframeCount = await page.locator('iframe[src*="chat"]').count();
  console.log(`Chat iframe count: ${iframeCount}`);

  const hostCount = await page.locator('lm-chatdock-host').count();
  console.log(`lm-chatdock-host count: ${hostCount}`);

  if (hostCount > 0) {
    const hostClasses = await page.locator('lm-chatdock-host').getAttribute('class');
    console.log(`Host classes: ${hostClasses}`);
  }
});
