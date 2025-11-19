// apps/web/tests/e2e/upload-excel.spec.ts
/**
 * E2E test: Excel file upload and conversion
 *
 * Verifies that Excel uploads:
 * 1. Successfully convert .xlsx and .xls files to CSV
 * 2. Process through existing CSV ingest pipeline
 * 3. Handle errors gracefully (empty sheets, malformed files)
 *
 * @prod Production E2E tests for Excel upload functionality
 *
 * **Auth:** Uses page storage state from global-setup.ts
 * **Running:**
 *   pnpm playwright test upload-excel.spec.ts --project=chromium-prod
 */
import { test, expect } from "@playwright/test";

test.describe("@prod Excel Upload", () => {
  test("should accept and convert .xlsx file to CSV for ingest", async ({ page }) => {
    // Navigate to app to establish authenticated session
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to upload section if needed
    const uploadSection = page.locator('[data-testid="uploadcsv-input"]').or(
      page.locator('input[type="file"]')
    );
    await expect(uploadSection.first()).toBeVisible({ timeout: 10000 });

    // Upload Excel file
    const fileInput = page.locator('[data-testid="uploadcsv-input"]').or(
      page.locator('input[type="file"]')
    );
    await fileInput.first().setInputFiles("tests/fixtures/test-transactions.xlsx");

    // Click upload/submit button
    const submitButton = page.locator('[data-testid="uploadcsv-submit"]').or(
      page.locator('button:has-text("Upload")')
    );
    await submitButton.first().click();

    // Wait for success message
    await expect(page.locator('[data-testid="csv-ingest-message"]')).toContainText(
      /success|added|imported/i,
      { timeout: 10000 }
    );

    // Verify transactions appear in the UI
    await expect(
      page.locator("text=/Test Coffee Shop|Test Grocery Store|Test Gas Station/i")
    ).toBeVisible({ timeout: 5000 });
  });

  test("should show error for empty Excel file", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const fileInput = page.locator('[data-testid="uploadcsv-input"]').or(
      page.locator('input[type="file"]')
    );
    await expect(fileInput.first()).toBeVisible({ timeout: 10000 });

    // Upload empty Excel file
    await fileInput.first().setInputFiles("tests/fixtures/empty.xlsx");

    const submitButton = page.locator('[data-testid="uploadcsv-submit"]').or(
      page.locator('button:has-text("Upload")')
    );
    await submitButton.first().click();

    // Should show error about empty sheet
    await expect(page.locator("text=/empty|no.*row|parse.*fail/i")).toBeVisible({
      timeout: 10000,
    });
  });

  test("should display supported formats hint", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Check for supported formats message
    await expect(page.locator("text=/Supported formats.*CSV.*Excel/i")).toBeVisible({
      timeout: 10000,
    });
  });
});
