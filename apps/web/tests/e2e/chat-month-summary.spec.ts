/**
 * E2E tests for month summary with finance formatters
 */

import { test, expect } from '@playwright/test';

test.describe('Month Summary Finance Formatting', () => {
  test.beforeEach(async ({ page }) => {
    // Note: This test requires authentication. Use .auth state or skip in CI.
    await page.goto('http://127.0.0.1:3000');

    // Wait for the app to load
    await page.waitForSelector('[data-chatdock-root]', { timeout: 10000 });
  });

  test('shows markdown bullets and bold currency in quick recap', async ({ page }) => {
    // Open chat dock
    const chatButton = page.locator('[data-chatdock-bubble]');
    if (await chatButton.isVisible()) {
      await chatButton.click();
    }

    // Wait for panel to open
    await page.waitForSelector('text=Agent Tools', { timeout: 5000 });

    // Click Month summary button
    await page.click('button:has-text("Month summary")');

    // Wait for response
    await page.waitForSelector('.chat-markdown', { timeout: 15000 });

    // Check for markdown structure
    const markdown = page.locator('.chat-markdown').first();
    await expect(markdown).toBeVisible();

    // Check for heading
    const heading = markdown.locator('h2');
    await expect(heading).toContainText('Quick recap');

    // Check for bold elements (income, spend, net)
    const boldElements = markdown.locator('strong');
    await expect(boldElements.first()).toBeVisible();

    // Check for list bullets
    const listItems = markdown.locator('li');
    expect(await listItems.count()).toBeGreaterThan(0);

    // Check currency format (should contain $ and commas)
    const text = await markdown.textContent();
    expect(text).toMatch(/\$[\d,]+\.\d{2}/); // Matches currency like $1,234.56
  });

  test('click deeper breakdown shows deep dive', async ({ page }) => {
    // Open chat dock
    const chatButton = page.locator('[data-chatdock-bubble]');
    if (await chatButton.isVisible()) {
      await chatButton.click();
    }

    // Wait for panel
    await page.waitForSelector('text=Agent Tools', { timeout: 5000 });

    // Click Month summary
    await page.click('button:has-text("Month summary")');

    // Wait for quick recap
    await page.waitForSelector('.chat-markdown', { timeout: 15000 });

    // Look for "Deeper breakdown" chip
    const deeperBreakdownChip = page.locator('[data-testid="action-chip-deeper-breakdown"]');
    await expect(deeperBreakdownChip).toBeVisible({ timeout: 5000 });

    // Click it
    await deeperBreakdownChip.click();

    // Wait for deep dive response
    await page.waitForTimeout(1000); // Small delay for response

    // Check for "Deep dive" heading
    const deepDiveHeading = page.locator('text=Deep dive').first();
    await expect(deepDiveHeading).toBeVisible();

    // Check for category list (top 5)
    const categories = page.locator('text=/\\d+\\./'); // Matches "1.", "2.", etc.
    expect(await categories.count()).toBeGreaterThanOrEqual(1);
  });

  test('deep dive shows action chips', async ({ page }) => {
    // Open chat dock
    const chatButton = page.locator('[data-chatdock-bubble]');
    if (await chatButton.isVisible()) {
      await chatButton.click();
    }

    await page.waitForSelector('text=Agent Tools', { timeout: 5000 });

    // Click Month summary
    await page.click('button:has-text("Month summary")');
    await page.waitForSelector('.chat-markdown', { timeout: 15000 });

    // Click deeper breakdown
    const deeperBreakdownChip = page.locator('[data-testid="action-chip-deeper-breakdown"]');
    await expect(deeperBreakdownChip).toBeVisible({ timeout: 5000 });
    await deeperBreakdownChip.click();

    await page.waitForTimeout(1000);

    // Check for action chips
    await expect(page.locator('[data-testid="action-chip-categorize-unknowns"]')).toBeVisible();
    await expect(page.locator('[data-testid="action-chip-show-spikes"]')).toBeVisible();
    await expect(page.locator('[data-testid="action-chip-top-merchants"]')).toBeVisible();
    await expect(page.locator('[data-testid="action-chip-budget-check"]')).toBeVisible();
  });

  test('clicking action chip sends correct NL command', async ({ page }) => {
    // Open chat dock
    const chatButton = page.locator('[data-chatdock-bubble]');
    if (await chatButton.isVisible()) {
      await chatButton.click();
    }

    await page.waitForSelector('text=Agent Tools', { timeout: 5000 });

    // Click Month summary
    await page.click('button:has-text("Month summary")');
    await page.waitForSelector('.chat-markdown', { timeout: 15000 });

    // Click deeper breakdown
    await page.click('[data-testid="action-chip-deeper-breakdown"]');
    await page.waitForTimeout(1000);

    // Click "Top merchants detail" chip
    await page.click('[data-testid="action-chip-top-merchants"]');

    // Check that a new user message appeared
    const userMessage = page.locator('text=Top merchants detail').last();
    await expect(userMessage).toBeVisible({ timeout: 5000 });

    // Wait for assistant response
    await page.waitForTimeout(2000);

    // Check for thinking indicator or response
    const thinkingOrResponse = page.locator('.chat-markdown, [aria-label="loading"]').last();
    await expect(thinkingOrResponse).toBeVisible();
  });

  test('aria-live region exists for accessibility', async ({ page }) => {
    // Open chat dock
    const chatButton = page.locator('[data-chatdock-bubble]');
    if (await chatButton.isVisible()) {
      await chatButton.click();
    }

    await page.waitForSelector('text=Agent Tools', { timeout: 5000 });

    // Check for aria-live attribute on messages container
    const messagesContainer = page.locator('[aria-live="polite"][role="log"]');
    await expect(messagesContainer).toBeVisible();
  });

  test('dark theme styles are applied correctly', async ({ page }) => {
    // Open chat dock
    const chatButton = page.locator('[data-chatdock-bubble]');
    if (await chatButton.isVisible()) {
      await chatButton.click();
    }

    await page.waitForSelector('text=Agent Tools', { timeout: 5000 });

    // Click Month summary
    await page.click('button:has-text("Month summary")');
    await page.waitForSelector('.chat-markdown', { timeout: 15000 });

    // Check that prose-invert class is applied (dark theme support)
    const markdown = page.locator('.prose-invert').first();
    await expect(markdown).toBeVisible();

    // Check for list item visibility (not hidden by dark background)
    const listItem = page.locator('.chat-markdown li').first();
    if (await listItem.isVisible()) {
      const color = await listItem.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });
      // Color should not be black (rgb(0, 0, 0)) in dark mode
      expect(color).not.toBe('rgb(0, 0, 0)');
    }
  });
});
