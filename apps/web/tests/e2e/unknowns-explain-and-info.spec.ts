import { test, expect } from "@playwright/test";

test.describe("@prod Unknowns explain + info", () => {
  test("shows explanation and info modal from unknowns card", async ({ page }) => {
    await page.goto(process.env.BASE_URL ?? "https://app.ledger-mind.org");

    // Navigate to dashboard where Unknowns panel lives
    const dashboardLink = page.getByRole("link", { name: /dashboard/i }).or(page.getByTestId("nav-dashboard"));
    await dashboardLink.click();

    const unknownsCard = page.getByTestId("uncat-card-root");
    await expect(unknownsCard).toBeVisible();

    // Wait for at least one suggestion chip
    const chip = unknownsCard.getByTestId("suggestion-pill").first();
    await expect(chip).toBeVisible({ timeout: 10000 });

    // Explain flow - click "Why this category?" button
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

    // Info modal from header
    const infoTrigger = unknownsCard
      .getByTestId("suggestions-info-trigger-unknowns");

    await expect(infoTrigger).toBeVisible();
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
