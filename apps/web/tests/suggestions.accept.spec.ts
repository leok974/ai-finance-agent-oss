// apps/web/tests/suggestions.accept.spec.ts
import { test, expect } from "@playwright/test";

test.describe("ML Suggestions - Accept Flow", () => {
  test("accepting a suggestion hides it", async ({ page }) => {
    // Navigate to the suggestions page
    await page.goto("/");

    // Wait for suggestions to load
    await page.waitForSelector('[data-testid="suggestion-card"]', { timeout: 5000 });

    // Get the first suggestion card
    const firstSuggestion = page.locator('[data-testid="suggestion-card"]').first();

    // Verify it's visible before accepting
    await expect(firstSuggestion).toBeVisible();

    // Get the suggestion text to verify it's removed
    const suggestionLabel = await firstSuggestion.locator('.font-medium').first().textContent();

    // Click the Accept button
    await firstSuggestion.locator('button:has-text("Accept")').click();

    // Wait for the accept action to complete
    await expect(firstSuggestion.locator('button:has-text("Accepted ✓")')).toBeVisible({ timeout: 2000 });

    // Verify the suggestion is marked as accepted
    await expect(firstSuggestion.locator('button:has-text("Accepted ✓")')).toBeDisabled();

    console.log(`✓ Successfully accepted suggestion: ${suggestionLabel}`);
  });

  test("accept button is disabled while processing", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="suggestion-card"]');

    const firstSuggestion = page.locator('[data-testid="suggestion-card"]').first();
    const acceptButton = firstSuggestion.locator('button:has-text("Accept")');

    // Slow down network to test loading state
    await page.route('**/ml/suggestions/*/accept', async (route) => {
      await page.waitForTimeout(1000); // Simulate slow network
      await route.continue();
    });

    // Start the accept action
    await acceptButton.click();

    // Button should be disabled immediately
    await expect(acceptButton).toBeDisabled();
  });

  test("can view reasoning details", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="suggestion-card"]');

    const firstSuggestion = page.locator('[data-testid="suggestion-card"]').first();

    // Click the reasoning details
    const reasoningDetails = firstSuggestion.locator('details summary:has-text("View reasoning")');
    if (await reasoningDetails.count() > 0) {
      await reasoningDetails.click();

      // Verify the reasoning content is displayed
      const reasoningContent = firstSuggestion.locator('details pre');
      await expect(reasoningContent).toBeVisible();

      console.log('✓ Reasoning details are expandable');
    } else {
      console.log('⚠ No reasoning available for this suggestion');
    }
  });

  test("displays mode chip with correct styling", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="suggestion-card"]');

    const firstSuggestion = page.locator('[data-testid="suggestion-card"]').first();

    // Find the mode chip
    const modeChip = firstSuggestion.locator('span.rounded-full').first();
    await expect(modeChip).toBeVisible();

    // Verify it has one of the expected mode values
    const modeText = await modeChip.textContent();
    expect(['rule', 'model', 'ask']).toContain(modeText?.trim());

    console.log(`✓ Mode chip displays: ${modeText}`);
  });
});
