import { Page } from "@playwright/test";

/**
 * Assert that the current user is logged in for production tests.
 * Throws a helpful error if the session has expired.
 *
 * Usage:
 *   await assertLoggedIn(page);
 */
export async function assertLoggedIn(page: Page) {
  try {
    const response = await page.request.get("/api/auth/me");

    if (response.status() === 401 || response.status() === 403) {
      throw new Error(
        "❌ Prod session expired or invalid.\n" +
        "Re-run the capture script to refresh authentication:\n\n" +
        "  1. Start Chrome: & \"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\" --remote-debugging-port=9222 --user-data-dir=\"C:\\tmp\\prod-profile\"\n" +
        "  2. Run capture: cd apps/web; $env:CAPTURE_CDP=\"1\"; pnpm run test:e2e:prod:capture\n" +
        "  3. Complete OAuth in browser and press ENTER\n"
      );
    }

    const body = await response.text();
    if (body.includes("unauthorized") || body.includes("not authenticated")) {
      throw new Error("Prod session expired. Re-run capture-prod-state.");
    }

    // Success: user is authenticated
    return true;
  } catch (error: any) {
    if (error.message?.includes("session expired")) {
      throw error;
    }
    // Network or other error - treat as authentication failure
    throw new Error(
      `Failed to verify authentication: ${error.message}\n` +
      "Ensure production backend is accessible and session is valid."
    );
  }
}

/**
 * Quick session check at the start of a test.
 * Logs a warning but doesn't fail the test if auth check fails.
 */
export async function checkSessionHealth(page: Page): Promise<boolean> {
  try {
    await assertLoggedIn(page);
    return true;
  } catch (error: any) {
    console.warn("⚠️  Session health check failed:", error.message);
    return false;
  }
}
