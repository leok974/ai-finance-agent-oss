/**
 * Debug test: Check if ChatDock mounts and logs to console
 */
import { test, expect } from '@playwright/test';

test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

test('@prod-debug ChatDock mount verification', async ({ page }) => {
  const consoleLogs: string[] = [];

  // Capture all console logs
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    console.log(`[BROWSER] ${text}`);
  });

  // Navigate to home with cache-busting
  await page.goto('/?_=' + Date.now());

  // Wait for React to finish rendering
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Check console logs
  console.log('\n=== CONSOLE LOGS CAPTURED ===');
  console.log(consoleLogs.join('\n'));
  console.log('=== END CONSOLE LOGS ===\n');

  // Look for ChatDock mount log
  const mountLog = consoleLogs.find(log => log.includes('ChatDock') && log.includes('MOUNTED'));

  if (mountLog) {
    console.log(`✅ ChatDock mounted! Log: ${mountLog}`);
  } else {
    console.log('❌ ChatDock NEVER mounted - no mount log found');
    console.log('ChatDock-related logs:', consoleLogs.filter(log => log.includes('ChatDock')));
  }

  // Check if element exists in DOM
  const chatDockElement = await page.locator('[data-testid="lm-chat-launcher-root"]').count();
  console.log(`ChatDock DOM elements found: ${chatDockElement}`);

  if (chatDockElement > 0) {
    const element = page.locator('[data-testid="lm-chat-launcher-root"]').first();
    const isVisible = await element.isVisible();
    const boundingBox = await element.boundingBox();
    console.log(`Element visible: ${isVisible}`);
    console.log(`Bounding box:`, boundingBox);
  }

  // This test is just for debugging - we'll manually check the output
  expect(consoleLogs.length).toBeGreaterThan(0);
});
