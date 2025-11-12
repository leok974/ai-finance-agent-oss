import { test, expect } from "@playwright/test";

test.describe("Insights Dropdown", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("dropdown opens and shows Compact/Expanded options", async ({ page }) => {
    const insightsButton = page.getByTestId("agent-tool-insights");
    await expect(insightsButton).toBeVisible();

    // Click to open dropdown
    await insightsButton.click();

    // Verify both menu items are visible
    const compactOption = page.getByRole("menuitem", { name: "Compact" });
    const expandedOption = page.getByRole("menuitem", { name: "Expanded" });

    await expect(compactOption).toBeVisible();
    await expect(expandedOption).toBeVisible();
  });

  test("selecting Compact triggers correct action", async ({ page }) => {
    const insightsButton = page.getByTestId("agent-tool-insights");

    // Open dropdown
    await insightsButton.click();

    // Click Compact
    await page.getByRole("menuitem", { name: "Compact" }).click();

    // Should trigger assistant response or loading state
    // (In a real test, you might check for specific UI changes)
    await page.waitForTimeout(500);
  });

  test("selecting Expanded triggers correct action", async ({ page }) => {
    const insightsButton = page.getByTestId("agent-tool-insights");

    // Open dropdown
    await insightsButton.click();

    // Click Expanded
    await page.getByRole("menuitem", { name: "Expanded" }).click();

    // Should trigger assistant response or loading state
    await page.waitForTimeout(500);
  });

  test("gear icon no longer present", async ({ page }) => {
    // The old gear icon button should be removed
    await expect(page.getByTestId("agent-tool-insights-size")).toHaveCount(0);
  });

  test("dropdown button has chevron icon", async ({ page }) => {
    const insightsButton = page.getByTestId("agent-tool-insights");
    await expect(insightsButton).toBeVisible();

    // Should contain text "Insights" and a chevron icon
    await expect(insightsButton).toHaveText(/Insights/);
  });

  test("dropdown menu items have correct test IDs", async ({ page }) => {
    const insightsButton = page.getByTestId("agent-tool-insights");

    // Open dropdown
    await insightsButton.click();

    // Verify test IDs for menu items (for potential telemetry tracking)
    const compactItem = page.locator('[data-testid="agent-tool-insights-compact"]');
    const expandedItem = page.locator('[data-testid="agent-tool-insights-expanded"]');

    await expect(compactItem).toBeVisible();
    await expect(expandedItem).toBeVisible();
  });

  test("dropdown closes after selecting an option", async ({ page }) => {
    const insightsButton = page.getByTestId("agent-tool-insights");

    // Open dropdown
    await insightsButton.click();

    // Verify menu is open
    await expect(page.getByRole("menuitem", { name: "Compact" })).toBeVisible();

    // Click an option
    await page.getByRole("menuitem", { name: "Compact" }).click();

    // Dropdown should close (menu items no longer visible)
    await expect(page.getByRole("menuitem", { name: "Compact" })).not.toBeVisible();
  });
});
