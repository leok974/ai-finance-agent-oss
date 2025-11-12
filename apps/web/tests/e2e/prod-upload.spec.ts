import { test, expect } from "@playwright/test";
import { assertLoggedIn } from "./utils/prodSession";

// @prod-safe: mutates only the test user's data (non-destructive for other users)
test.describe("@prod-safe", () => {
  // Verify session is valid before running tests
  test.beforeEach(async ({ page }) => {
    await assertLoggedIn(page);
  });

  test("can upload CSV and see charts", async ({ page }) => {
    await page.goto("/");

    // Wait for page to load
    await page.waitForLoadState("domcontentloaded");

    // Find upload input using more flexible selector
    const uploadInput = page.locator('input[type="file"][accept*="csv"]');
    await expect(uploadInput).toBeAttached();

    // Upload the mini CSV fixture
    await uploadInput.setInputFiles("tests/e2e/fixtures/mini.csv");

    // Wait for upload to complete and charts to appear
    // After upload, we should see either:
    // 1. Total Spend metric
    // 2. Chart visualizations
    // 3. Transaction list
    // 4. Success message/toast
    const totalSpend = page.getByText(/Total Spend/i);
    const chartArea = page.locator('[class*="chart"], [role="img"]');
    const transactionTable = page.locator('table, [role="table"]');

    // At least one indicator of successful data load should be visible
    // Use first() to avoid strict mode violations when multiple matches exist
    const successIndicator = totalSpend
      .or(chartArea)
      .or(transactionTable)
      .first();

    await expect(successIndicator).toBeVisible({ timeout: 15_000 });
  });
});
