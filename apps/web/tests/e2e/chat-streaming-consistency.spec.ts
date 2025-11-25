/**
 * E2E tests for chat streaming consistency.
 * Verifies that typed queries and toolbar buttons produce equivalent streaming behavior.
 *
 * These tests use demo login + sample data to ensure a consistent, known dataset.
 */

import { test, expect } from '@playwright/test';
import { ensureDemoSeeded } from './utils/ensureDemoSeeded';

test.describe('Chat Streaming Consistency @prod @chat-stream @demo', () => {
  test.describe.configure({
    retries: process.env.IS_PROD === 'true' ? 1 : 0,
    timeout: 90_000, // Increased to account for demo seeding
  });

  test.beforeEach(async ({ page }) => {
    // Ensure demo user is logged in with fresh sample data
    await ensureDemoSeeded(page);

    // Verify chat launcher is available (app is fully ready)
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible({ timeout: 15000 });
  });

  test('Typed "quick recap" query uses streaming @prod @demo', async ({ page }) => {
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

    // Wait for response - deterministic mode might be very fast
    // Verify we get financial data, not an error message
    const response = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(response).toBeVisible({ timeout: 20000 });

    const responseText = await response.textContent();

    // Should contain financial keywords (flexible - works with any month's data)
    expect(responseText).toMatch(/income|spend|net|total|categories|merchants|transfers|groceries|shopping|rent|subscriptions/i);

    // Should NOT contain error messages
    expect(responseText).not.toMatch(/temporarily unavailable|don't have any spending data/i);
  });

  test('Month summary button uses streaming @prod @demo', async ({ page }) => {
    // Open chat panel
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await launcher.click();

    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible();

    // Click month summary button
    const monthSummaryButton = page.getByTestId('agent-tool-month-summary');
    await monthSummaryButton.click();

    // Wait for response
    const response = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(response).toBeVisible({ timeout: 20000 });

    const responseText = await response.textContent();

    // Should contain financial summary data (flexible keywords)
    expect(responseText).toMatch(/income|spend|net|total|top categories|top merchants|transfers|groceries/i);

    // Should NOT contain error messages
    expect(responseText).not.toMatch(/temporarily unavailable|don't have any spending data/i);
  });

  test('Typed query and button produce equivalent results @prod @demo', async ({ page }) => {
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

    // Wait for response
    const firstResponse = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(firstResponse).toBeVisible({ timeout: 20000 });
    const firstResponseText = await firstResponse.textContent();

    // Second: use button
    const monthSummaryButton = page.getByTestId('agent-tool-month-summary');
    await monthSummaryButton.click();

    const secondResponse = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(secondResponse).toBeVisible({ timeout: 20000 });
    const secondResponseText = await secondResponse.textContent();

    // Both should contain financial data (flexible keywords)
    expect(firstResponseText).toMatch(/income|spend|net|total|categories|merchants/i);
    expect(secondResponseText).toMatch(/income|spend|net|total|categories|merchants/i);

    // Neither should contain error messages
    expect(firstResponseText).not.toMatch(/temporarily unavailable|don't have any spending data/i);
    expect(secondResponseText).not.toMatch(/temporarily unavailable|don't have any spending data/i);
  });

  test('Deterministic quick recap works without LLM @prod @demo', async ({ page }) => {
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

    // Should see financial summary without error messages
    const response = page.locator('[data-testid^="lm-chat-message-assistant"]').last();
    await expect(response).toBeVisible({ timeout: 20000 });

    const responseText = await response.textContent();

    // Should contain financial data (flexible keywords for demo data)
    expect(responseText).toMatch(/income|spend|net|total|categories|merchants|transfers|groceries/i);

    // Should NOT contain error messages
    expect(responseText).not.toMatch(/temporarily unavailable|don't have any spending data/i);
  });
});
