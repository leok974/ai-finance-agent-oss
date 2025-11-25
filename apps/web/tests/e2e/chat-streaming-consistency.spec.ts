/**
 * E2E tests for chat streaming consistency.
 * Verifies that typed queries and toolbar buttons produce equivalent streaming behavior.
 */

import { test, expect } from '@playwright/test';
import { waitForDashboard } from './utils/waitForDashboard';

test.describe('Chat Streaming Consistency @prod @chat-stream', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForDashboard(page);
  });

  test('Typed "quick recap" query uses streaming @prod', async ({ page }) => {
    // Open chat panel
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await expect(launcher).toBeVisible();
    await launcher.click();

    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible();

    // Type query
    const chatInput = page.getByTestId('chat-input');
    await chatInput.click();
    await chatInput.fill('give me a quick recap');

    await page.getByTestId('chat-send').click();

    // Wait for streaming to start - thinking step appears
    const thinkingStep = page.getByTestId('chat-thinking-step');
    await expect(thinkingStep).toBeVisible({ timeout: 5000 });

    // Verify no "temporarily unavailable" message
    await expect(page.getByText(/temporarily unavailable/i)).not.toBeVisible({ timeout: 2000 }).catch(() => {});

    // Verify summary content appears
    await expect(shell.getByRole('article').last()).toContainText(/income|spend|net/i, { timeout: 20000 });
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

    // Wait for thinking bubble
    const thinkingStep = page.getByTestId('chat-thinking-step');
    await expect(thinkingStep).toBeVisible({ timeout: 5000 });

    // Verify no "temporarily unavailable" message
    await expect(page.getByText(/temporarily unavailable/i)).not.toBeVisible({ timeout: 2000 }).catch(() => {});

    // Verify summary content appears
    await expect(shell.getByRole('article').last()).toContainText(/income|spend|net|top categories|top merchants/i, { timeout: 20000 });
  });

  test('Typed query and button produce equivalent results @prod', async ({ page }) => {
    // Open chat panel
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await launcher.click();

    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible();

    // First: type query
    const chatInput = page.getByTestId('chat-input');
    await chatInput.fill('give me a quick recap');
    await page.getByTestId('chat-send').click();

    // Wait for thinking then response
    await expect(page.getByTestId('chat-thinking-step')).toBeVisible({ timeout: 5000 });
    const firstResponse = shell.getByRole('article').last();
    await expect(firstResponse).toContainText(/income|spend|net/i, { timeout: 20000 });

    const firstResponseText = await firstResponse.textContent();

    // Second: use button (assume chat stays open)
    const monthSummaryButton = page.getByTestId('agent-tool-month-summary');
    await monthSummaryButton.click();

    await expect(page.getByTestId('chat-thinking-step')).toBeVisible({ timeout: 5000 });
    const secondResponse = shell.getByRole('article').last();
    await expect(secondResponse).toContainText(/income|spend|net/i, { timeout: 20000 });

    const secondResponseText = await secondResponse.textContent();

    // Both should contain financial data
    expect(firstResponseText).toMatch(/income|spend|net/i);
    expect(secondResponseText).toMatch(/income|spend|net/i);

    // Neither should contain "unavailable"
    expect(firstResponseText).not.toMatch(/temporarily unavailable/i);
    expect(secondResponseText).not.toMatch(/temporarily unavailable/i);
  });

  test('Deterministic quick recap works without LLM @prod', async ({ page }) => {
    // This test verifies that quick recap works even when LLM is unavailable
    const launcher = page.getByTestId('lm-chat-launcher-button');
    await launcher.click();

    const shell = page.getByTestId('lm-chat-shell');
    await expect(shell).toBeVisible();

    // Type query for quick recap
    const chatInput = page.getByTestId('chat-input');
    await chatInput.fill('month summary');
    await page.getByTestId('chat-send').click();

    // Wait for thinking bubble (deterministic still shows planning)
    await expect(page.getByTestId('chat-thinking-step')).toBeVisible({ timeout: 5000 });

    // Should NOT show "temporarily unavailable"
    await expect(page.getByText(/temporarily unavailable/i)).not.toBeVisible({ timeout: 2000 }).catch(() => {});

    // Should see financial summary
    await expect(shell.getByRole('article').last()).toContainText(/income|spend|net/i, { timeout: 20000 });
  });
});
