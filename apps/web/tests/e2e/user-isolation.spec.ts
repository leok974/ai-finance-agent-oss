import { test, expect } from "@playwright/test";

/**
 * User Isolation E2E Test
 *
 * Verifies that:
 * 1. New users see empty state (no data from other users)
 * 2. User A's transactions are not visible to User B
 * 3. Each user only sees their own data
 */

test.describe("Multi-user data isolation", () => {
  test("New user sees empty state; User A data is not visible to User B", async ({
    browser,
  }) => {
    // Create two separate browser contexts (simulating different users)
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // === User A: Login and upload data ===
      await pageA.goto("/");

      // Wait for login or auto-login (adjust based on your auth flow)
      // If using dev mode with auto-login, you may not need this
      // await pageA.getByText(/Login/i).click();
      // await loginAs(pageA, 'userA@example.com', 'password123');

      // Upload CSV file
      await pageA.waitForSelector('[data-testid="upload-csv-button"]', {
        timeout: 10000,
      });
      await pageA.getByTestId("upload-csv-button").click();

      // Simulate file upload
      const fileInput = await pageA.locator('input[type="file"]');
      await fileInput.setInputFiles("tests/fixtures/sample-transactions.csv");

      // Wait for upload to complete
      await pageA.waitForResponse((response) => {
        return response.url().includes("/ingest") && response.status() === 200;
      });

      // Verify User A sees their dashboard with data
      await expect(pageA.getByText(/Total Spend/i)).toBeVisible({
        timeout: 5000,
      });

      // Get User A's transaction count (should be > 0)
      const userATransactions = await pageA
        .locator('[data-testid="transaction-row"]')
        .count();
      expect(userATransactions).toBeGreaterThan(0);

      console.log(`✅ User A has ${userATransactions} transactions visible`);

      // === User B: Login as different user ===
      await pageB.goto("/");

      // Login as User B (or use different session)
      // If using dev mode, you may need to clear cookies and re-login
      // await pageB.context().clearCookies();
      // await loginAs(pageB, 'userB@example.com', 'password456');

      // Verify User B sees empty state (no data from User A)
      await expect(
        pageB.getByText(/Upload Transactions CSV/i)
      ).toBeVisible({
        timeout: 5000,
      });

      // Verify User B does NOT see User A's transaction data
      await expect(pageB.getByText(/Total Spend/i)).toHaveCount(0);

      // Verify no transaction rows visible
      const userBTransactions = await pageB
        .locator('[data-testid="transaction-row"]')
        .count();
      expect(userBTransactions).toBe(0);

      console.log(`✅ User B sees empty state (0 transactions)`);

      // === Verify Cache-Control headers ===
      const response = await pageA.goto("/transactions");
      const cacheControl = response?.headers()["cache-control"];

      expect(cacheControl).toContain("private");
      expect(cacheControl).toContain("no-store");

      console.log(`✅ Cache-Control headers correct: ${cacheControl}`);
    } finally {
      // Cleanup
      await contextA.close();
      await contextB.close();
    }
  });

  test("User A cannot access User B's transaction by ID", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // User B uploads a transaction
      await pageB.goto("/");
      // ... upload logic ...

      // Get User B's transaction ID
      const userBTxnId = await pageB
        .locator('[data-testid="transaction-row"]')
        .first()
        .getAttribute("data-txn-id");

      // User A tries to access User B's transaction by ID
      const response = await pageA.goto(`/api/transactions/${userBTxnId}`);

      // Should return 403 Forbidden or 404 Not Found
      expect([403, 404]).toContain(response?.status());

      console.log(
        `✅ User A cannot access User B's transaction (status: ${response?.status()})`
      );
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});

/**
 * Helper function to login (adjust based on your auth implementation)
 */
async function loginAs(page: any, email: string, password: string) {
  await page.getByLabel(/Email/i).fill(email);
  await page.getByLabel(/Password/i).fill(password);
  await page.getByRole("button", { name: /Login/i }).click();
  await page.waitForURL("/", { timeout: 5000 });
}
