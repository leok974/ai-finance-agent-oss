import { test, expect } from '@playwright/test';

// Use authenticated state from existing setup
test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('Build Stamp @prod', () => {
  test('main app build stamp prints in console', async ({ page }) => {
    const consoleMessages: string[] = [];

    // Capture all console messages
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    // Navigate to app
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Wait a moment for console to settle
    await page.waitForTimeout(1000);

    // Find 🚀 LedgerMind Web banner (new styled format)
    const hasBuildBanner = consoleMessages.some(m =>
      m.includes('🚀 LedgerMind Web') && m.includes('build')
    );

    expect(hasBuildBanner, 'missing 🚀 LedgerMind Web banner in console').toBeTruthy();
  });

  test('ChatDock v2 build stamp prints in console', async ({ page }) => {
    const consoleMessages: string[] = [];

    // Capture all console messages (ChatDock v2 logs directly to main page)
    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    // Clear any chat fuse from previous failures
    await page.goto(`${BASE_URL}?chat=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(100);

    // Navigate to app in diag mode
    await page.goto(`${BASE_URL}?chat=diag`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // Auth settle

    // Check if authenticated
    const url = page.url();
    if (url.includes('google.com') || url.includes('accounts')) {
      test.skip(true, 'Not authenticated - skipping test');
      return;
    }

    // Find chat launcher and click it
    const bubble = page.locator('[data-testid="lm-chat-launcher-button"]');
    await bubble.waitFor({ state: 'visible', timeout: 15000 });
    await bubble.click();

    // Wait for shell to appear (ChatDock v2 uses direct React, not iframe)
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    await shell.waitFor({ state: 'visible', timeout: 5000 });

    // Wait for ChatDock initialization messages
    await page.waitForTimeout(1000);

    // Find 💬 ChatDock v2 banner (new styled format)
    const hasChatDockV2Banner = consoleMessages.some(m =>
      m.includes('💬 ChatDock v2') && m.includes('overlay-card layout active')
    );

    expect(hasChatDockV2Banner, 'missing 💬 ChatDock v2 banner in console').toBeTruthy();
  });

  test('build stamps contain branch and commit info', async ({ page }) => {
    const consoleMessages: string[] = [];

    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const buildMsg = consoleMessages.find(m => m.includes('🚀 LedgerMind Web'));
    expect(buildMsg, 'should have 🚀 LedgerMind Web banner').toBeTruthy();

    // New format: "🚀 LedgerMind Web  build  branch@commit (timestamp)"
    // Should contain @ separator and parenthesized timestamp
    expect(buildMsg, 'build stamp should contain @ separator').toMatch(/@/);
    expect(buildMsg, 'build stamp should contain timestamp in parens').toMatch(/\(/);
  });

  test('build metadata is attached to window', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const buildMeta = await page.evaluate(() => {
      return (window as any).__LEDGERMIND_BUILD__;
    });

    expect(buildMeta, '__LEDGERMIND_BUILD__ should exist').toBeTruthy();
    expect(buildMeta.branch, 'should have branch').toBeTruthy();
    expect(buildMeta.commit, 'should have commit').toBeTruthy();
    expect(buildMeta.buildId, 'should have buildId').toBeTruthy();
  });
});
