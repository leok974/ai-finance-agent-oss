import { test, expect } from "@playwright/test";

test.describe("@prod Unknowns explain + info", () => {
  test("shows explanation and info modal from unknowns card", async ({ page }) => {
    await page.goto("/", { waitUntil: 'load', timeout: 60000 });

    // Wait for the unknowns card to be visible (should be on dashboard by default)
    const unknownsCard = page.getByTestId("uncat-card-root");
    await expect(unknownsCard).toBeVisible({ timeout: 15000 });

    // Check if there are any unknowns with suggestions
    // If not, we can still test the info modal
    const chip = unknownsCard.getByTestId("suggestion-pill").first();
    const hasUnknowns = await chip.isVisible().catch(() => false);

    if (hasUnknowns) {
      // Test explain flow if unknowns exist
      const explainButton = unknownsCard
        .getByRole("button", { name: /why this category/i })
        .first();

      await explainButton.click();

      const explainDrawer = page.getByTestId("explain-drawer");
      await expect(explainDrawer).toBeVisible();
      await expect(explainDrawer).toContainText(/why this category/i);

      // Close the explain drawer
      await page.getByTestId("drawer-close").click();
      await expect(explainDrawer).not.toBeVisible();
    }

    // Always test the info modal (should be visible even without unknowns)
    const infoTrigger = page.getByTestId("suggestions-info-trigger-unknowns");

    await expect(infoTrigger).toBeVisible({ timeout: 5000 });
    await infoTrigger.click();

    const infoModal = page.getByTestId("suggestions-info-modal-unknowns");
    await expect(infoModal).toBeVisible();
    await expect(infoModal).toContainText("How suggestions work");
    await expect(infoModal).toContainText("LedgerMind suggestions are generated");

    // Close the info modal
    const closeButton = infoModal.getByRole("button", { name: /close/i });
    await closeButton.click();
    await expect(infoModal).not.toBeVisible();
  });
});
