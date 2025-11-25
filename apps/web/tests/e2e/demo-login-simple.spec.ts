/**
 * Simple demo login test - verifies demo mode works in production.
 */

import { test, expect } from '@playwright/test';

test.describe('Demo Login @prod', () => {
  test('Demo login shows demo banner @prod', async ({ page, context }) => {
    // Clear storage to start fresh
    await context.clearCookies();
    
    // Navigate to homepage
    await page.goto('/', { waitUntil: 'load', timeout: 60000 });

    // Click demo button
    const demoButton = page.getByTestId('btn-demo');
    await expect(demoButton).toBeVisible({ timeout: 10000 });
    await demoButton.click();

    // Wait for page reload and demo banner
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    
    // Verify chat launcher is available
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 15000 });

    console.log('✅ Demo login successful - app loaded');
  });
});
