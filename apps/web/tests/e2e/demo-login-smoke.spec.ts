import { test, expect } from "@playwright/test";

/**
 * Demo login smoke test - verifies the demo login flow works end-to-end
 *
 * Flow:
 * 1. Visit landing page (unauthenticated)
 * 2. Click "Try Demo" button
 * 3. Verify redirect to dashboard
 * 4. Verify demo banner is visible
 * 5. Verify demo data is populated (non-zero insights)
 */

test.describe("@demo Demo Login Flow", () => {
  test("demo button logs in and shows demo data", async ({ page, context }) => {
    // Clear cookies to ensure we start unauthenticated
    await context.clearCookies();

    // Navigate to landing page
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Should see landing hero (not authenticated)
    const demoButton = page.getByTestId("btn-demo");
    await expect(demoButton).toBeVisible();

    // Click demo button
    await demoButton.click();

    // Should redirect to dashboard after demo login
    await page.waitForURL("/", { waitUntil: "domcontentloaded", timeout: 10000 });

    // Verify demo banner is visible
    const demoBanner = page.getByTestId("demo-banner");
    await expect(demoBanner).toBeVisible();
    await expect(demoBanner).toContainText("Demo Mode");

    // Verify demo data is loaded - check for insights card with non-zero data
    const insightsCard = page.locator('[data-testid="insights-card"], .section:has-text("Insights")');
    await expect(insightsCard).toBeVisible({ timeout: 15000 });

    // Should have some dollar amounts visible (indicates data is loaded)
    const dollarAmount = page.locator('text=/\\$[0-9,]+/').first();
    await expect(dollarAmount).toBeVisible({ timeout: 10000 });

    // Verify account menu shows demo user
    const accountMenu = page.getByTestId("account-menu");
    await expect(accountMenu).toBeVisible();
  });

  test("demo user sees charts with data", async ({ page, context }) => {
    // Clear cookies to start fresh
    await context.clearCookies();

    // Navigate and login via demo
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const demoButton = page.getByTestId("btn-demo");
    await demoButton.click();
    await page.waitForURL("/", { waitUntil: "domcontentloaded", timeout: 10000 });

    // Wait for charts panel to load
    const chartsSection = page.locator('.section:has-text("Charts"), [data-testid="charts-panel"]').first();
    await expect(chartsSection).toBeVisible({ timeout: 15000 });

    // Should see chart titles or spending categories
    const chartContent = page.locator('text=/spending|income|balance|categories/i').first();
    await expect(chartContent).toBeVisible({ timeout: 10000 });
  });
});
