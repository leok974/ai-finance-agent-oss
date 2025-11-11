import { test } from '@playwright/test';

test.use({
  storageState: 'tests/e2e/.auth/prod-state.json'
});

test('check chat with saved auth', async ({ page }) => {
  const logs: string[] = [];

  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', error => {
    logs.push(`[PAGE ERROR] ${error.message}`);
  });

  await page.goto('https://app.ledger-mind.org/?chat=1');

  // Check cookies
  const cookies = await page.context().cookies();
  console.log(`\n=== COOKIES LOADED ===`);
  console.log(`Cookie count: ${cookies.length}`);
  cookies.forEach(c => console.log(`  ${c.name}: ${c.value.substring(0, 20)}...`));

  // Wait for chat to mount or fail
  await page.waitForTimeout(8000);

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

  // Check for React errors
  const reactErrors = logs.filter(l => l.includes('React') || l.includes('Error') || l.includes('error'));
  if (reactErrors.length > 0) {
    console.log('\n=== ERRORS ===');
    reactErrors.forEach(e => console.log(e));
  }
});
