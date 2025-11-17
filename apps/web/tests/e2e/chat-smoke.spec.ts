import { test, expect } from '@playwright/test';

/**
 * Smoke test for ChatDock v2 (direct React, no iframe)
 * Verifies basic functionality after refactor from iframe-based chat
 */

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

test.describe('@prod ChatDock v2 smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('chat launcher button is visible and clickable', async ({ page }) => {
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 15000 });

    // Click to open
    await launcher.click();

    // Shell should appear
    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible({ timeout: 5000 });
  });

  test('chat launcher root has correct state', async ({ page }) => {
    const root = page.getByTestId('lm-chat-launcher');
    await expect(root).toBeAttached();

    // Should start closed
    await expect(root).toHaveAttribute('data-state', 'closed');

    // Open chat
    const button = page.getByTestId('lm-chat-launcher-button');
    await button.click();

    // Should be open
    await expect(root).toHaveAttribute('data-state', 'open', { timeout: 3000 });
  });

  test('page does not have overflow hidden (CSS fix)', async ({ page }) => {
    const htmlOverflow = await page.evaluate(() => {
      return window.getComputedStyle(document.documentElement).overflow;
    });

    expect(htmlOverflow).not.toBe('hidden');
  });

  test('chat overlay and backdrop render when open', async ({ page }) => {
    const button = page.getByTestId('lm-chat-launcher-button');
    await button.click();

    const overlay = page.getByTestId('lm-chat-overlay');
    const backdrop = page.getByTestId('lm-chat-backdrop');
    const shell = page.getByTestId('lm-chat-shell');

    await expect(overlay).toBeAttached();
    await expect(backdrop).toBeAttached();
    await expect(shell).toBeVisible();
  });

  test('ChatDock renders and console logs appear', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'log') {
        consoleLogs.push(msg.text());
      }
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait a bit for console logs
    await page.waitForTimeout(2000);

    // Check for ChatDock bootstrap logs
    const chatDockLogs = consoleLogs.filter(log =>
      log.includes('ChatDock') || log.includes('[build')
    );

    expect(chatDockLogs.length, 'ChatDock should log during initialization').toBeGreaterThan(0);
  });
});
