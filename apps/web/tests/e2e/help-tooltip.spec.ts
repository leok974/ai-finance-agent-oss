import { test, expect } from '@playwright/test';

test.describe('Help Tooltip', () => {
  test('What deterministic, Why uses LLM when available', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Stub LLM describe endpoint
    await page.route('**/agent/describe/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ why: 'Spend rose due to flights.' }),
      });
    });

    // Wait for page to load and find a help button (overview card has one)
    await page.waitForSelector('[aria-label="Card help"]', { timeout: 10000 });

    // Click help button for Top Merchants chart (or any card)
    const helpButtons = await page.$$('[aria-label="Card help"]');
    if (helpButtons.length === 0) {
      throw new Error('No help buttons found on page');
    }

    // Click the first help button
    await helpButtons[0].click();

    // Wait for popover to appear
    await page.waitForSelector('[data-popover-role="card-help"]', { state: 'visible' });

    // What tab should be active by default and show deterministic copy
    const whatTab = page.getByRole('button', { name: /^what$/i }).first();
    await expect(whatTab).toHaveClass(/bg-accent/);

    // Check that deterministic content is visible
    // The exact text depends on which card, but it should not say "Loading" or "unavailable"
    const content = await page.locator('[data-popover-role="card-help"] .whitespace-pre-wrap').textContent();
    expect(content).toBeTruthy();
    expect(content).not.toContain('Loading');

    // Check for DETERMINISTIC badge
    await expect(page.getByText('DETERMINISTIC')).toBeVisible();

    // Switch to Why tab
    const whyTab = page.getByRole('button', { name: /^why$/i }).first();
    await whyTab.click();

    // Wait for LLM response
    await page.waitForTimeout(500);

    // Should show LLM-generated text
    await expect(page.getByText(/Spend rose due to flights/)).toBeVisible();
  });

  test('Why tab shows unavailable when LLM is down', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Stub LLM describe endpoint to return error
    await page.route('**/agent/describe/*', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'LLM unavailable' }),
      });
    });

    // Wait for and click help button
    await page.waitForSelector('[aria-label="Card help"]', { timeout: 10000 });
    const helpButtons = await page.$$('[aria-label="Card help"]');
    await helpButtons[0].click();

    // Wait for popover
    await page.waitForSelector('[data-popover-role="card-help"]', { state: 'visible' });

    // Switch to Why tab
    const whyTab = page.getByRole('button', { name: /^why$/i }).first();
    await whyTab.click();

    // Should show unavailable message
    await expect(page.getByText(/language model is temporarily unavailable/i)).toBeVisible();
  });

  test('What tab works for each card type', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Get all help buttons
    await page.waitForSelector('[aria-label="Card help"]', { timeout: 10000 });
    const helpButtons = await page.$$('[aria-label="Card help"]');

    // Test a few help buttons to ensure they all show deterministic content
    for (let i = 0; i < Math.min(3, helpButtons.length); i++) {
      await helpButtons[i].click();

      // Wait for popover
      await page.waitForSelector('[data-popover-role="card-help"]', { state: 'visible' });

      // Check for deterministic content
      const content = await page.locator('[data-popover-role="card-help"] .whitespace-pre-wrap').textContent();
      expect(content).toBeTruthy();
      expect(content?.length).toBeGreaterThan(20);

      // Check for badge
      await expect(page.getByText('DETERMINISTIC')).toBeVisible();

      // Close popover by clicking close button
      await page.getByRole('button', { name: /close/i }).first().click();

      // Wait for popover to disappear
      await page.waitForSelector('[data-popover-role="card-help"]', { state: 'hidden' });
    }
  });
});
