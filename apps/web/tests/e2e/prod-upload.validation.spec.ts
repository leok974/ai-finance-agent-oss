import { test, expect } from "@playwright/test";

test.describe("@prod-safe", () => {
  test("rejects non-CSV and shows a validation error", async ({ page }) => {
    await page.goto("/");

    // Ensure upload is visible (or open the upload panel first if your UX hides it)
    const uploader = page.locator('input[type="file"][accept*="csv"]');
    await expect(uploader).toBeAttached();

    // Try to upload a TS file (intentionally invalid)
    await uploader.setInputFiles("tests/e2e/fixtures/invalid.ts");

    // 1) Prefer an ARIA/status/toast role if present
    const toast = page.getByRole("status").or(page.getByRole("alert"));
    // 2) Else, match a generic substring that won't drift
    const genericMsg = page.getByText(/invalid|not.*csv|parse.*error|unsupported|format|failed/i);

    // Wait for either toast or generic error message
    await expect(toast.or(genericMsg)).toBeVisible({ timeout: 10_000 });

    // Optional: verify server actually rejected
    // (If you emit a network call we can peek into, assert HTTP 4xx)
    // Example:
    // const response = await page.waitForResponse(resp =>
    //   resp.url().includes('/upload') && resp.status() >= 400
    // );
    // expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("accepts valid CSV and processes successfully", async ({ page }) => {
    await page.goto("/");

    const uploader = page.locator('input[type="file"][accept*="csv"]');
    await expect(uploader).toBeAttached();

    // Upload a valid CSV
    await uploader.setInputFiles("tests/e2e/fixtures/mini.csv");

    // After successful upload, should see data indicators
    // (adjust selectors to match your actual UI)
    const successIndicators = page.getByText(/Total Spend|uploaded|success|processed/i)
      .or(page.locator('table, [role="table"]'))
      .or(page.locator('[class*="chart"]'));

    await expect(successIndicators.first()).toBeVisible({ timeout: 10_000 });
  });
});
