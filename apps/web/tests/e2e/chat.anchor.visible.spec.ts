import { test, expect } from '@playwright/test';

// Use saved production auth state
test.use({
  storageState: 'tests/e2e/.auth/prod-state.json'
});

test.describe('ChatDock v2 positioning', () => {
  test('@prod chat opens at launcher without clipping', async ({ page }) => {
    // Navigate to app (should be authenticated via storageState)
    await page.goto(process.env.BASE_URL || 'http://localhost:5173');

    // Wait for app to load
    await page.waitForLoadState('networkidle');

    // Wait for and click chat launcher
    const bubble = page.locator('[data-testid="lm-chat-launcher-button"]');
    await bubble.waitFor({ state: 'visible', timeout: 10000 });
    await bubble.click();

    // Shell should appear (ChatDock v2 uses direct React, not iframe)
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    await shell.waitFor({ state: 'visible', timeout: 5000 });

    // Check the panel (the actual card container) is within viewport bounds
    // The shell itself may be larger than viewport as it contains scrollable content
    const panel = page.locator('[data-testid="lm-chat-panel"]');
    await expect(panel).toBeVisible({ timeout: 3000 });

    const box = await panel.boundingBox();
    expect(box).toBeTruthy();

    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1); // +1 for rounding

    // Panel should fit within viewport height (it's the visible container)
    expect(box!.height, 'panel height should be reasonable').toBeLessThanOrEqual(viewport.height);

    // Verify panel has reasonable size
    expect(box!.width).toBeGreaterThan(300);
    expect(box!.height).toBeGreaterThan(200);
  });

  test.skip('@prod chat input works and messages display', async ({ page }) => {
    // TODO: This test needs DOM selectors for ChatDock v2 message input
    // Need to identify correct selectors for textarea and submit button
    await page.goto(process.env.BASE_URL || 'http://localhost:5173');
    await page.waitForLoadState('networkidle');

    const bubble = page.locator('[data-testid="lm-chat-launcher-button"]');
    await bubble.click();

    // ChatDock v2 uses direct React components (no iframe)
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    await shell.waitFor({ state: 'visible', timeout: 5000 });

    // Find input and send button within the shell
    const input = page.locator('textarea[placeholder*="Ask"], input[placeholder*="Ask"]');
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.fill('test message');

    const sendBtn = page.locator('button[type="submit"]').filter({ hasText: /send/i });
    await sendBtn.click();

    // Message should appear in thread
    await expect(page.locator('.lm-msg, .bubble, [data-testid*="message"]')).toContainText('test message', { timeout: 3000 });
  });
});
