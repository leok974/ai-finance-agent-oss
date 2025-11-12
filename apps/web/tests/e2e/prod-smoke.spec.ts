import { test, expect } from "@playwright/test";
import { assertLoggedIn } from "./utils/prodSession";

// @prod-safe: does not mutate server state
test.describe("@prod-safe", () => {
  // Verify session is valid before running tests
  test.beforeEach(async ({ page }) => {
    await assertLoggedIn(page);
  });

  test("loads dashboard while authenticated", async ({ page, baseURL }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    // Header avatar should show (you recently wired it to auth state)
    await expect(page.getByTestId("account-button")).toBeVisible();

    // Empty state OR charts—both are valid depending on whether this test user has data
    const uploadPanel = page.getByText(/Upload Transactions CSV/i);
    const totalSpend  = page.getByText(/Total Spend/i);
    await expect(uploadPanel.or(totalSpend)).toBeVisible();

    // Auth pages must be private/no-store
    const resp = await page.request.get(new URL("/api/auth/me", baseURL!).toString());
    expect(resp.headers()["cache-control"]?.toLowerCase()).toContain("no-store");
  });
});
