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
    await page.waitForTimeout(500);

    // Find build stamp message
    const buildMsg = consoleMessages.find(m => m.includes('[build]'));

    expect(buildMsg, 'missing [build] banner in console').toBeTruthy();
    expect(buildMsg, 'build stamp should contain @').toMatch(/@/);
    expect(buildMsg, 'build stamp should contain ISO timestamp').toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('chat iframe build stamp prints in console', async ({ page }) => {
    const consoleMessages: string[] = [];

    // Capture all console messages (from main frame AND iframe)
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
    const bubble = page.locator('[data-testid="lm-chat-bubble"]');
    await bubble.waitFor({ state: 'visible', timeout: 15000 });
    await bubble.click();

    // Wait for iframe to load and initialize
    const iframe = page.locator('[data-testid="lm-chat-iframe"]');
    await iframe.waitFor({ state: 'attached', timeout: 5000 });
    await expect(iframe).toHaveCSS('opacity', '1', { timeout: 3000 });

    // Wait for chat boot messages
    await page.waitForTimeout(1000);

    // Find chat build stamp message
    const chatBuildMsg = consoleMessages.find(m => m.includes('[build/chat]'));

    expect(chatBuildMsg, 'missing [build/chat] banner in console').toBeTruthy();
    expect(chatBuildMsg, 'chat build stamp should contain @').toMatch(/@/);
    expect(chatBuildMsg, 'chat build stamp should contain ISO timestamp').toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('build stamps contain branch and commit info', async ({ page }) => {
    const consoleMessages: string[] = [];

    page.on('console', msg => {
      consoleMessages.push(msg.text());
    });

    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const buildMsg = consoleMessages.find(m => m.includes('[build]'));
    expect(buildMsg).toBeTruthy();

    // Should have format: [build] branch@commit timestamp
    // e.g., [build] fix/chat-iframe-csp@9d96d9b80c2c  2025-11-12T13:31:34.529Z
    const parts = buildMsg!.split(/\s+/);
    expect(parts.length, 'build stamp should have at least 3 parts').toBeGreaterThanOrEqual(3);

    // Second part should be branch@commit
    const branchCommit = parts[1];
    expect(branchCommit, 'should have @ separator').toMatch(/@/);

    // Third part should be ISO timestamp
    const timestamp = parts[2];
    expect(timestamp, 'should be valid ISO timestamp').toMatch(/^\d{4}-\d{2}-\d{2}T/);
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
