import { test, expect } from "@playwright/test";

test.describe("@prod Transactions suggestions", () => {
  // TODO: Update navigation - TransactionsPanel might be in a drawer or modal
  test.skip("shows suggestions, explain, and info modal in drawer", async ({ page }) => {
    await page.goto("/", { waitUntil: 'load', timeout: 60000 });

    // TODO: Find correct way to navigate to transactions view
    // TransactionsPanel might be accessed via a button/drawer instead of navigation link
    const transactionsTable = page.getByRole("table").or(page.locator("[data-testid*='transaction']").first());
    await expect(transactionsTable).toBeVisible({ timeout: 10000 });

    // Find a row that has suggestion pills (look for "SUGGESTED" label)
    const suggestedLabel = page.getByText("SUGGESTED").or(page.getByText("Suggested")).first();
    await expect(suggestedLabel).toBeVisible({ timeout: 10000 });

    // Get the parent row container
    const suggestedRow = suggestedLabel.locator("xpath=ancestor::tr[1]");

    // Explain flow - click "Why this category?" button within the suggested row
    const explainButton = page
      .getByRole("button", { name: /why this category/i })
      .first();

    await explainButton.click();

    const explainDrawer = page.getByTestId("explain-drawer");
    await expect(explainDrawer).toBeVisible();
    await expect(explainDrawer).toContainText(/why this category/i);

    // Close the explain drawer
    await page.getByTestId("drawer-close").click();
    await expect(explainDrawer).not.toBeVisible();

    // Info modal (transactions source)
    const infoTrigger = page
      .getByTestId("suggestions-info-trigger-transactions")
      .first();

    await expect(infoTrigger).toBeVisible();
    await infoTrigger.click();

    const infoModal = page.getByTestId("suggestions-info-modal-transactions");
    await expect(infoModal).toBeVisible();
    await expect(infoModal).toContainText("How suggestions work");
    await expect(infoModal).toContainText("LedgerMind suggestions are generated");

    // Close the info modal
    const closeButton = infoModal.getByRole("button", { name: /close/i });
    await closeButton.click();
    await expect(infoModal).not.toBeVisible();
  });

  // TODO: Update navigation once we know how to access transactions view
  test.skip("displays confidence percentage in suggestion row", async ({ page }) => {
    await page.goto("/", { waitUntil: 'load', timeout: 60000 });

    // TODO: Navigate to transactions view
    // Wait for suggestions to appear
    const suggestedLabel = page.getByText("SUGGESTED").or(page.getByText("Suggested")).first();
    await expect(suggestedLabel).toBeVisible({ timeout: 10000 });

    // Look for confidence percentage (e.g., "85% confident")
    const confidenceBadge = page.getByText(/\d+% confident/i).first();
    await expect(confidenceBadge).toBeVisible();
  });
});
