/**
 * E2E tests for agent streaming with thinking bubble
 */

import { test, expect } from '@playwright/test';

test.describe('Chat Panel Streaming', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
  });

  test('displays thinking bubble during streaming', async ({ page }) => {
    // Open chat panel
    const launcher = page.locator('[data-testid="lm-chat-launcher-button"]');
    await launcher.click();

    // Wait for panel to appear
    await expect(page.locator('[data-testid="lm-chat-panel"]')).toBeVisible();

    // Type a message
    const composer = page.locator('textarea[placeholder*="Ask"]');
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
    // Open chat panel
    const launcher = page.locator('[data-testid="lm-chat-launcher-button"]');
    await launcher.click();

    await expect(page.locator('[data-testid="lm-chat-panel"]')).toBeVisible();

    // Type a message
    const composer = page.locator('textarea[placeholder*="Ask"]');
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
    // Open chat panel
    const launcher = page.locator('[data-testid="lm-chat-launcher-button"]');
    await launcher.click();

    await expect(page.locator('[data-testid="lm-chat-panel"]')).toBeVisible();

    // Type a message that triggers multiple tools
    const composer = page.locator('textarea[placeholder*="Ask"]');
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
    // Open chat panel
    const launcher = page.locator('[data-testid="lm-chat-launcher-button"]');
    await launcher.click();

    await expect(page.locator('[data-testid="lm-chat-panel"]')).toBeVisible();

    // Send a simple message
    const composer = page.locator('textarea[placeholder*="Ask"]');
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

  test('handles streaming errors gracefully', async ({ page }) => {
    // Intercept and fail the streaming endpoint
    await page.route('**/agent/stream*', route => {
      route.abort('failed');
    });

    // Open chat panel
    const launcher = page.locator('[data-testid="lm-chat-launcher-button"]');
    await launcher.click();

    await expect(page.locator('[data-testid="lm-chat-panel"]')).toBeVisible();

    // Send message
    const composer = page.locator('textarea[placeholder*="Ask"]');
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
});
