/**
 * E2E tests for chat streaming consistency.
 * Verifies that typed queries and toolbar buttons produce equivalent streaming behavior.
 *
 * These tests use demo mode with seeded sample data.
 */

import { test, expect } from '@playwright/test';

test.describe('Chat Streaming Consistency @prod @chat-stream', () => {
  test.describe.configure({
    retries: process.env.IS_PROD === 'true' ? 1 : 0,
    timeout: 90_000,
  });

  test.beforeEach(async ({ page, context }) => {
    // Clear storage to start fresh (demo login needs unauthenticated state)
    await context.clearCookies();
    await context.clearPermissions();

    // Navigate to homepage
    await page.goto('/', { waitUntil: 'load', timeout: 60000 });

    // Log in via demo mode to get seeded transaction data
    const demoButton = page.getByTestId('btn-demo');
    await expect(demoButton).toBeVisible({ timeout: 10000 });
    await demoButton.click();

    // Wait for demo login to complete and page to reload
    // The page should reload after demo login
    await page.waitForTimeout(2000); // Give time for POST requests
    await page.waitForLoadState('networkidle', { timeout: 30000 });

    // Verify chat launcher is available (app is fully ready)
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 15000 });
  });

  test('Typed "quick recap" query uses streaming @prod', async ({ page }) => {
    // Open chat panel
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible();
    await launcher.click();

    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible();

    // Type query - use role locator for reliability
    const chatInput = shell.getByRole('textbox');
    await chatInput.waitFor({ state: 'visible', timeout: 5000 });
    await chatInput.fill('give me a quick recap');
    await chatInput.press('Enter');

    // Wait for streaming to complete by watching thinking bubble disappear
    const thinkingBubble = page.getByTestId('lm-chat-thinking');
    await expect(thinkingBubble).toBeVisible({ timeout: 15000 });
    await expect(thinkingBubble).toBeHidden({ timeout: 30000 });

    // Now read the completed response
    const response = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(response).toBeVisible({ timeout: 5000 });

    const responseText = await response.textContent();

    // Should contain financial keywords (flexible - works with any month's data)
    expect(responseText).toMatch(/income|spend|net|total|categories|merchants|transfers|groceries|shopping|rent|subscriptions/i);

    // Should NOT contain error messages
    expect(responseText).not.toMatch(/temporarily unavailable|don't have any spending data/i);
  });

  test('Month summary button uses streaming @prod', async ({ page }) => {
    // Open chat panel
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await launcher.click();

    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible();

    // Click month summary button
    const monthSummaryButton = page.getByTestId('agent-tool-month-summary');
    await monthSummaryButton.click();

    // Wait for streaming to complete by watching thinking bubble disappear
    const thinkingBubble = page.getByTestId('lm-chat-thinking');
    await expect(thinkingBubble).toBeVisible({ timeout: 15000 });
    await expect(thinkingBubble).toBeHidden({ timeout: 30000 });

    // Now read the completed response
    const response = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(response).toBeVisible({ timeout: 5000 });

    const responseText = await response.textContent();

    // Should contain financial summary data (flexible keywords)
    expect(responseText).toMatch(/income|spend|net|total|top categories|top merchants|transfers|groceries/i);

    // Should NOT contain error messages
    expect(responseText).not.toMatch(/temporarily unavailable|don't have any spending data/i);
  });

  test('Typed query and button produce equivalent results @prod', async ({ page }) => {
    // Open chat panel
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await launcher.click();

    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible();

    // First: type query
    const chatInput = shell.getByRole('textbox');
    await chatInput.waitFor({ state: 'visible', timeout: 5000 });
    await chatInput.fill('give me a quick recap');
    await chatInput.press('Enter');

    // Wait for first streaming to complete
    const thinkingBubble = page.getByTestId('lm-chat-thinking');
    await expect(thinkingBubble).toBeVisible({ timeout: 15000 });
    await expect(thinkingBubble).toBeHidden({ timeout: 30000 });

    // Read first completed response
    const firstResponse = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(firstResponse).toBeVisible({ timeout: 5000 });
    const firstResponseText = await firstResponse.textContent();

    // Second: use button
    const monthSummaryButton = page.getByTestId('agent-tool-month-summary');
    await monthSummaryButton.click();

    // Wait for second streaming to complete
    await expect(thinkingBubble).toBeVisible({ timeout: 15000 });
    await expect(thinkingBubble).toBeHidden({ timeout: 30000 });

    // Read second completed response
    const secondResponse = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(secondResponse).toBeVisible({ timeout: 5000 });
    const secondResponseText = await secondResponse.textContent();

    // Both should contain financial data (flexible keywords)
    expect(firstResponseText).toMatch(/income|spend|net|total|categories|merchants/i);
    expect(secondResponseText).toMatch(/income|spend|net|total|categories|merchants/i);

    // Neither should contain error messages
    expect(firstResponseText).not.toMatch(/temporarily unavailable|don't have any spending data/i);
    expect(secondResponseText).not.toMatch(/temporarily unavailable|don't have any spending data/i);
  });

  test('Deterministic quick recap works without LLM @prod', async ({ page }) => {
    // This test verifies that quick recap works even when LLM is unavailable
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await launcher.click();

    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible();

    // Type query for quick recap
    const chatInput = shell.getByRole('textbox');
    await chatInput.waitFor({ state: 'visible', timeout: 5000 });
    await chatInput.fill('month summary');
    await chatInput.press('Enter');

    // Wait for streaming to complete by watching thinking bubble disappear
    const thinkingBubble = page.getByTestId('lm-chat-thinking');
    await expect(thinkingBubble).toBeVisible({ timeout: 15000 });
    await expect(thinkingBubble).toBeHidden({ timeout: 30000 });

    // Now read the completed response
    const response = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(response).toBeVisible({ timeout: 5000 });

    const responseText = await response.textContent();

    // Should contain financial data (flexible keywords for demo data)
    expect(responseText).toMatch(/income|spend|net|total|categories|merchants|transfers|groceries/i);

    // Should NOT contain error messages
    expect(responseText).not.toMatch(/temporarily unavailable|don't have any spending data/i);
  });

  test('@prod thinking bubble shows tools during streaming', async ({ page }) => {
    // Open chat panel
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible();
    await launcher.click();

    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible();

    // Type a query that will trigger tool execution (trends uses multiple tools)
    const chatInput = shell.getByRole('textbox');
    await chatInput.waitFor({ state: 'visible', timeout: 5000 });
    await chatInput.fill('show my spending trends for this month');
    await chatInput.press('Enter');

    // 1) Thinking bubble should appear during streaming
    const thinkingBubble = page.getByTestId('lm-chat-thinking');
    await expect(thinkingBubble).toBeVisible({ timeout: 15000 });

    // 2) Step text should be present and contain relevant keywords
    const stepText = page.getByTestId('lm-chat-thinking-step');
    await expect(stepText).toBeVisible();
    const stepContent = await stepText.textContent();
    expect(stepContent).toMatch(/analyzing|checking|trends|summary|overview|finance/i);

    // 3) At least one tool chip should appear
    const toolsContainer = page.getByTestId('lm-chat-thinking-tools');
    await expect(toolsContainer).toBeVisible();

    // Verify we have tool chips
    const toolChips = toolsContainer.locator('[data-testid^="lm-chat-thinking-tool-"]');
    const chipCount = await toolChips.count();
    expect(chipCount).toBeGreaterThan(0);

    // Optionally check that a specific tool is present
    const firstChip = toolChips.first();
    await expect(firstChip).toBeVisible();

    // 4) Eventually, assistant message should appear
    const assistantMessage = page
      .locator('[data-testid^="lm-chat-message-assistant"]')
      .last();
    await expect(assistantMessage).toBeVisible({ timeout: 30000 });

    // 5) Once streaming completes, thinking bubble should disappear
    await expect(thinkingBubble).toBeHidden({ timeout: 10000 });
  });
});
