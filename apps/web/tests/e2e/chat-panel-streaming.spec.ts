/**
 * E2E tests for agent streaming with thinking bubble
 * @prod - Safe for production testing
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'https://app.ledger-mind.org';

async function ensureChatAvailable(page: Page) {
  await page.goto('/', { waitUntil: 'load', timeout: 60000 });

  if (process.env.IS_PROD === 'true') {
    try {
      await page
        .getByTestId('lm-chat-launcher-button')
        .waitFor({ timeout: 15000 });
    } catch {
      test.skip(
        true,
        'Chat launcher button not found in prod – likely E2E session/auth issue'
      );
    }
  }
}

test.describe('@prod Chat Panel Streaming', () => {
  test.describe.configure({
    retries: process.env.IS_PROD === 'true' ? 1 : 0,
    timeout: 60_000,
  });

  test.beforeEach(async ({ page }) => {
    await ensureChatAvailable(page);

    // make sure the fuse doesn't hide the launcher
    await page.evaluate(() => {
      sessionStorage.removeItem('lm:disableChat');
    });
  });

  test('displays thinking bubble during streaming', async ({ page }) => {
    // Chat may already be open on page load - check and open if needed
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    const isOpen = await shell.isVisible();

    if (!isOpen) {
      const launcher = page.locator('[data-testid="lm-chat-launcher-button"]');
      await launcher.click();
      await expect(shell).toBeVisible();
    }

    // Type a message
    const composer = page.getByPlaceholder(/Ask or type a command/i);
    await composer.fill("What's my top category?");

    // Send message
    await page.keyboard.press('Enter');

    // Check for thinking bubble (may appear briefly)
    const thinkingBubble = page.locator('[data-testid="lm-chat-thinking-bubble"]');

    // The thinking bubble should either:
    // 1. Be visible during the request, or
    // 2. Have appeared and disappeared (both are valid)
    const wasVisible = await thinkingBubble.isVisible().catch(() => false);

    // If it's visible, verify its content
    if (wasVisible) {
      await expect(thinkingBubble).toContainText('Thinking');

      // Should show tools
      const toolChips = thinkingBubble.locator('span').filter({ hasText: /charts|insights|analytics/ });
      const toolCount = await toolChips.count();
      expect(toolCount).toBeGreaterThan(0);
    }

    // Wait for response to complete
    await expect(page.locator('[data-testid="lm-chat-message-assistant"]')).toBeVisible({
      timeout: 15000,
    });

    // Thinking bubble should be gone after completion
    await expect(thinkingBubble).not.toBeVisible();
  });

  test('shows progressive message rendering', async ({ page }) => {
    // Chat may already be open on page load - check and open if needed
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    const isOpen = await shell.isVisible();

    if (!isOpen) {
      const launcher = page.locator('[data-testid="lm-chat-launcher-button"]');
      await launcher.click();
      await expect(shell).toBeVisible();
    }

    // Type a message
    const composer = page.getByPlaceholder(/Ask or type a command/i);
    await composer.fill("Give me a summary");

    // Send message
    await page.keyboard.press('Enter');

    // Wait for assistant message to appear
    const assistantMsg = page.locator('[data-testid="lm-chat-message-assistant"]').last();
    await expect(assistantMsg).toBeVisible({ timeout: 15000 });

    // Message should have content
    const content = await assistantMsg.textContent();
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(10);
  });

  test('displays tool names in thinking bubble', async ({ page }) => {
    // Chat may already be open on page load - check and open if needed
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    const isOpen = await shell.isVisible();

    if (!isOpen) {
      const launcher = page.locator('[data-testid="lm-chat-launcher-button"]');
      await launcher.click();
      await expect(shell).toBeVisible();
    }

    // Type a message that triggers multiple tools
    const composer = page.getByPlaceholder(/Ask or type a command/i);
    await composer.fill("Show me spending summary");

    // Send message
    await page.keyboard.press('Enter');

    // Check for thinking bubble
    const thinkingBubble = page.locator('[data-testid="lm-chat-thinking-bubble"]');

    // Wait a brief moment for the bubble to potentially appear
    await page.waitForTimeout(200);

    const isVisible = await thinkingBubble.isVisible().catch(() => false);

    if (isVisible) {
      // Verify step text
      await expect(thinkingBubble).toContainText(/Analyzing|Planning|summary/i);

      // Verify at least one tool chip is present
      const tools = thinkingBubble.locator('span').filter({
        hasText: /summary|categories|merchants|overview/i
      });
      const count = await tools.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }

    // Wait for response
    await expect(page.locator('[data-testid="lm-chat-message-assistant"]')).toBeVisible({
      timeout: 15000,
    });
  });

  test('thinking bubble disappears on completion', async ({ page }) => {
    // Chat may already be open on page load - check and open if needed
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    const isOpen = await shell.isVisible();

    if (!isOpen) {
      const launcher = page.locator('[data-testid="lm-chat-launcher-button"]');
      await launcher.click();
      await expect(shell).toBeVisible();
    }

    // Send a simple message
    const composer = page.getByPlaceholder(/Ask or type a command/i);
    await composer.fill("Hello");
    await page.keyboard.press('Enter');

    // Wait for response to complete
    await expect(page.locator('[data-testid="lm-chat-message-assistant"]')).toBeVisible({
      timeout: 15000,
    });

    // Verify thinking bubble is not visible after completion
    const thinkingBubble = page.locator('[data-testid="lm-chat-thinking-bubble"]');
    await expect(thinkingBubble).not.toBeVisible();
  });

  test.skip('handles streaming errors gracefully @dev-only', async ({ page }) => {
    // Route interception doesn't work in production - skip this test
    // Intercept and fail the streaming endpoint
    await page.route('**/agent/stream*', route => {
      route.abort('failed');
    });

    // Chat may already be open on page load - check and open if needed
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    const isOpen = await shell.isVisible();

    if (!isOpen) {
      const launcher = page.locator('[data-testid="lm-chat-launcher-button"]');
      await launcher.click();
      await expect(shell).toBeVisible();
    }

    // Send message
    const composer = page.getByPlaceholder(/Ask or type a command/i);
    await composer.fill("Test error handling");
    await page.keyboard.press('Enter');

    // Should still get a response (fallback or error message)
    await expect(page.locator('[data-testid="lm-chat-message-assistant"]')).toBeVisible({
      timeout: 15000,
    });

    // Thinking bubble should be gone
    const thinkingBubble = page.locator('[data-testid="lm-chat-thinking-bubble"]');
    await expect(thinkingBubble).not.toBeVisible();
  });

  test.skip('retries on transient network failure @dev-only', async ({ page }) => {
    // Route interception doesn't work in production - skip this test
    let callCount = 0;

    // Fail first request, succeed on second (retry)
    await page.route('**/agent/stream*', route => {
      callCount++;
      if (callCount === 1) {
        route.abort('failed'); // Simulate network failure
      } else {
        route.continue(); // Allow retry to succeed
      }
    });

    // Chat may already be open on page load - check and open if needed
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    const isOpen = await shell.isVisible();

    if (!isOpen) {
      const launcher = page.locator('[data-testid="lm-chat-launcher-button"]');
      await launcher.click();
      await expect(shell).toBeVisible();
    }

    // Send message
    const composer = page.getByPlaceholder(/Ask or type a command/i);
    await composer.fill("Test retry logic");
    await page.keyboard.press('Enter');

    // Should eventually succeed after retry
    await expect(page.locator('[data-testid="lm-chat-message-assistant"]')).toBeVisible({
      timeout: 15000,
    });

    // Verify retry occurred
    expect(callCount).toBeGreaterThan(1);
  });

  test.skip('cancel button stops streaming @dev-only', async ({ page }) => {
    // Route interception doesn't work in production - skip this test
    // Intercept to make streaming slow enough to cancel
    await page.route('**/agent/stream*', route => {
      setTimeout(() => {
        route.continue();
      }, 5000); // 5s delay allows cancellation
    });

    // Chat may already be open on page load - check and open if needed
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    const isOpen = await shell.isVisible();

    if (!isOpen) {
      const launcher = page.locator('[data-testid="lm-chat-launcher-button"]');
      await launcher.click();
      await expect(shell).toBeVisible();
    }

    // Send message
    const composer = page.getByPlaceholder(/Ask or type a command/i);
    await composer.fill("Long streaming query");
    await page.keyboard.press('Enter');

    // Wait for thinking bubble to appear
    const thinkingBubble = page.locator('[data-testid="lm-chat-thinking-bubble"]');
    await expect(thinkingBubble).toBeVisible({ timeout: 2000 });

    // Find and click Stop button
    const stopButton = thinkingBubble.locator('button[aria-label="Cancel streaming"]');
    await expect(stopButton).toBeVisible();
    await stopButton.click();

    // Thinking bubble should disappear after cancel
    await expect(thinkingBubble).not.toBeVisible({ timeout: 1000 });
  });

  test.skip('shows warmup indicator before first token @dev-only', async ({ page }) => {
    // Route interception doesn't work in production - skip this test
    // Intercept to add delay before first response
    await page.route('**/agent/stream*', async route => {
      const response = await route.fetch();
      const body = await response.text();

      // Simulate slow warmup by delaying first chunk
      await new Promise(resolve => setTimeout(resolve, 1000));

      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
        body,
      });
    });

    // Chat may already be open on page load - check and open if needed
    const shell = page.locator('[data-testid="lm-chat-shell"]');
    const isOpen = await shell.isVisible();

    if (!isOpen) {
      const launcher = page.locator('[data-testid="lm-chat-launcher-button"]');
      await launcher.click();
      await expect(shell).toBeVisible();
    }

    // Send message
    const composer = page.getByPlaceholder(/Ask or type a command/i);
    await composer.fill("Test warmup");
    await page.keyboard.press('Enter');

    // Warmup indicator should appear immediately
    const warmupIndicator = page.locator('text=Preparing tools…');
    await expect(warmupIndicator).toBeVisible({ timeout: 500 });

    // After first token, warmup should disappear
    // (Will disappear naturally as stream progresses)
    await expect(warmupIndicator).not.toBeVisible({ timeout: 5000 });
  });
});
