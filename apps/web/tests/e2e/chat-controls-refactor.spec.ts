import { test, expect } from "@playwright/test";

/**
 * Chat Controls & Hotkeys Test
 *
 * Verifies:
 * 1. Clear button visible, Reset button NOT visible
 * 2. Ctrl+Shift+R opens Reset modal
 * 3. Clear/Reset modals work correctly
 */

test.describe("Chat Controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("Clear button is visible, Reset button is not", async ({ page }) => {
    const clearButton = page.getByTestId("agent-tool-clear");
    const resetButton = page.getByTestId("agent-tool-reset");

    // Clear should be visible
    await expect(clearButton).toBeVisible();

    // Reset should NOT exist as inline button
    await expect(resetButton).toHaveCount(0);
  });

  test("Ctrl+Shift+R opens Reset modal", async ({ page }) => {
    // Press Ctrl+Shift+R
    await page.keyboard.press("Control+Shift+KeyR");

    // Wait for modal to appear
    await expect(page.getByRole("heading", { name: /reset session/i })).toBeVisible();

    // Verify Reset button in modal
    await expect(page.getByRole("button", { name: /reset session/i })).toBeVisible();

    // Cancel
    await page.getByRole("button", { name: /cancel/i }).click();

    // Modal should close
    await expect(page.getByRole("heading", { name: /reset session/i })).not.toBeVisible();
  });

  test("Clear button opens modal with correct content", async ({ page }) => {
    const clearButton = page.getByTestId("agent-tool-clear");

    await clearButton.click();

    // Verify modal content
    await expect(page.getByRole("heading", { name: /clear chat history/i })).toBeVisible();
    await expect(page.getByText(/remove the visible messages/i)).toBeVisible();

    // Verify action buttons
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /clear chat/i })).toBeVisible();
  });

  test("Clear modal tooltip has correct text", async ({ page }) => {
    const clearButton = page.getByTestId("agent-tool-clear");

    // Check tooltip
    await clearButton.hover();

    // Wait a moment for tooltip to appear
    await page.waitForTimeout(500);

    // Get title attribute
    const title = await clearButton.getAttribute("title");
    expect(title).toContain("model state unchanged");
  });

  test("Insights button has size toggle", async ({ page }) => {
    const insightsButton = page.getByTestId("agent-tool-insights");
    const sizeToggle = page.getByTestId("agent-tool-insights-size");

    await expect(insightsButton).toBeVisible();
    await expect(sizeToggle).toBeVisible();

    // Click size toggle
    await sizeToggle.click();

    // Verify dropdown options
    await expect(page.getByRole("menuitem", { name: /compact/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /expanded/i })).toBeVisible();
  });

  test("Insights tooltip mentions size toggle", async ({ page }) => {
    const insightsButton = page.getByTestId("agent-tool-insights");

    await insightsButton.hover();
    await page.waitForTimeout(500);

    const title = await insightsButton.getAttribute("title");
    expect(title).toMatch(/size toggle|compact|expanded/i);
  });

  test("Suggest budget button has correct label", async ({ page }) => {
    const suggestBudgetButton = page.getByTestId("agent-tool-suggest-budget");

    await expect(suggestBudgetButton).toBeVisible();

    // Verify text is "Suggest budget" not "Budget suggest"
    await expect(suggestBudgetButton).toHaveText("Suggest budget");
  });
});
