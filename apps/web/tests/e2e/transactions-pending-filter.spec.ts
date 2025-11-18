/**
 * End-to-end test for pending transactions filter
 * Tests that users can filter transactions by status (all/posted/pending)
 */

import { test, expect } from "@playwright/test";

test.describe("@frontend Pending Transactions Filter", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to transactions page
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");
  });

  test("status filter dropdown is visible and defaults to All", async ({
    page,
  }) => {
    const statusFilter = page.getByTestId("transactions-status-filter");
    await expect(statusFilter).toBeVisible();

    // Should default to "All"
    const selectedValue = await statusFilter.inputValue();
    expect(selectedValue).toBe("all");
  });

  test("can switch to pending-only filter", async ({ page }) => {
    const statusFilter = page.getByTestId("transactions-status-filter");

    // Select "Pending only"
    await statusFilter.selectOption("pending");

    // Verify selection
    const selectedValue = await statusFilter.inputValue();
    expect(selectedValue).toBe("pending");

    // Wait for API call to complete
    await page.waitForLoadState("networkidle");

    // Verify URL/API was called with status=pending (check network)
    // Note: In real test, you might intercept the API call to verify params
  });

  test("can switch to posted-only filter", async ({ page }) => {
    const statusFilter = page.getByTestId("transactions-status-filter");

    // Select "Posted only"
    await statusFilter.selectOption("posted");

    // Verify selection
    const selectedValue = await statusFilter.inputValue();
    expect(selectedValue).toBe("posted");

    // Wait for API call to complete
    await page.waitForLoadState("networkidle");
  });

  test("pending badge appears on pending transactions", async ({
    page,
    request,
  }) => {
    // Create a pending transaction via API
    const createResponse = await request.post("/txns/edit", {
      data: {
        date: new Date().toISOString().split("T")[0],
        merchant: "Test Pending Store",
        description: "Pending test transaction",
        amount: 42.0,
        category: "Shopping",
        pending: true,
      },
    });

    expect(createResponse.ok()).toBeTruthy();

    // Reload page to see new transaction
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Filter to pending only
    const statusFilter = page.getByTestId("transactions-status-filter");
    await statusFilter.selectOption("pending");
    await page.waitForLoadState("networkidle");

    // Look for "Pending" badge (amber badge with text "Pending")
    const pendingBadge = page.getByText("Pending").first();
    await expect(pendingBadge).toBeVisible({ timeout: 5000 });

    // Verify badge styling (should be amber)
    const badgeClasses = await pendingBadge.getAttribute("class");
    expect(badgeClasses).toContain("amber");
  });

  test("posted-only filter excludes pending transactions", async ({
    page,
    request,
  }) => {
    // Create one pending transaction
    await request.post("/txns/edit", {
      data: {
        date: new Date().toISOString().split("T")[0],
        merchant: "Pending Store",
        description: "Should not appear in posted filter",
        amount: 10.0,
        category: "Shopping",
        pending: true,
      },
    });

    // Reload and filter to posted only
    await page.reload();
    await page.waitForLoadState("networkidle");

    const statusFilter = page.getByTestId("transactions-status-filter");
    await statusFilter.selectOption("posted");
    await page.waitForLoadState("networkidle");

    // Pending badge should NOT be visible
    const pendingBadge = page.getByText("Pending");
    await expect(pendingBadge).not.toBeVisible();
  });

  test("all filter shows both pending and posted transactions", async ({
    page,
    request,
  }) => {
    // Create one pending and one posted transaction
    await request.post("/txns/edit", {
      data: {
        date: new Date().toISOString().split("T")[0],
        merchant: "Posted Store",
        description: "Posted transaction",
        amount: 20.0,
        category: "Shopping",
        pending: false,
      },
    });

    await request.post("/txns/edit", {
      data: {
        date: new Date().toISOString().split("T")[0],
        merchant: "Pending Store",
        description: "Pending transaction",
        amount: 30.0,
        category: "Shopping",
        pending: true,
      },
    });

    // Reload and ensure "All" is selected
    await page.reload();
    await page.waitForLoadState("networkidle");

    const statusFilter = page.getByTestId("transactions-status-filter");
    await statusFilter.selectOption("all");
    await page.waitForLoadState("networkidle");

    // Both merchants should be visible
    await expect(page.getByText("Posted Store")).toBeVisible();
    await expect(page.getByText("Pending Store")).toBeVisible();

    // Pending badge should be visible (for the pending one)
    await expect(page.getByText("Pending")).toBeVisible();
  });
});
