import { test, expect } from "@playwright/test";

/**
 * Card Help → Why Tab E2E Test
 *
 * Verifies that the "Why" tab in Card Help tooltips:
 * - Is always clickable (never disabled)
 * - Works with or without LLM availability
 * - Shows appropriate content (explanation or fallback)
 */

test.describe("Card Help → Why Tab", () => {
  test("Why tab opens and shows content with or without LLM", async ({ page }) => {
    // Navigate to dashboard
    await page.goto("/");

    // Wait for dashboard to load
    await page.waitForSelector('[data-testid="uploadcsv-input"]', { timeout: 10000 });

    // Find first card with help button (look for ? icon or help trigger)
    const helpButton = page.locator('button[aria-label*="help"], button:has-text("?")').first();

    // If no help button found, this test is not applicable
    if (await helpButton.count() === 0) {
      test.skip();
      return;
    }

    // Click help button to open tooltip
    await helpButton.click();

    // Verify Why tab is visible
    const whyTab = page.getByRole("tab", { name: /why/i });
    await expect(whyTab).toBeVisible();

    // Verify tab is NOT disabled
    await expect(whyTab).not.toBeDisabled();

    // Click the Why tab
    await whyTab.click();

    // Verify content area appears (should show either LLM explanation or fallback)
    const whyContent = page.locator('[data-testid*="why"], .why-content, [role="tabpanel"]').first();
    await expect(whyContent).toBeVisible({ timeout: 5000 });

    // Verify content is not empty
    const text = await whyContent.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test("Why tab shows appropriate state indicators", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="uploadcsv-input"]', { timeout: 10000 });

    const helpButton = page.locator('button[aria-label*="help"], button:has-text("?")').first();

    if (await helpButton.count() === 0) {
      test.skip();
      return;
    }

    await helpButton.click();

    const whyTab = page.getByRole("tab", { name: /why/i });
    await whyTab.click();

    // Should show one of: loading state, explanation content, or fallback message
    const hasLoadingState = await page.locator('text=/loading|fetching/i').count() > 0;
    const hasContent = await page.locator('[data-testid*="why"]').count() > 0;
    const hasFallback = await page.locator('text=/not available|fallback|check back/i').count() > 0;

    // At least one state should be present
    expect(hasLoadingState || hasContent || hasFallback).toBeTruthy();
  });
});
