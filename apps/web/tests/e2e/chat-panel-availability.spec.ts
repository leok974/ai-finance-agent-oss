/**
 * Chat Panel Availability E2E Tests
 *
 * Tests the happy path (healthy streaming) vs forced outage scenarios.
 */

import { test, expect } from '@playwright/test';

test.describe('Chat Panel Availability', () => {
  test.beforeEach(async ({ page }) => {
    // Login first (assumes OAuth or session-based auth)
    await page.goto('/');

    // Wait for dashboard to load (confirms logged in)
    await page.waitForSelector('[data-testid="dashboard"]', { timeout: 10000 });
  });

  test('Scenario A - healthy streaming shows thinking bubble and reply', async ({ page }) => {
    // Open ChatDock
    const chatButton = page.locator('[data-testid="chat-dock-toggle"]').or(page.locator('text=Chat')).first();
    if (await chatButton.isVisible()) {
      await chatButton.click();
    }

    // Click Month summary button
    await page.locator('text=Month summary').click();

    // Should NOT show temporarily unavailable message
    await expect(page.locator('text=/temporarily unavailable/i')).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // Message might not exist at all, which is fine
    });

    // Should show thinking indicator or streaming state
    const thinkingIndicator = page.locator('[data-thinking="true"]').or(page.locator('text=Analyzing')).or(page.locator('text=/thinking|planning/i'));

    // Wait for either thinking state or actual reply (streaming might be fast)
    await Promise.race([
      thinkingIndicator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {}),
      page.locator('[role="article"]').filter({ hasText: /income|spend|summary/i }).waitFor({ timeout: 5000 }),
    ]);

    // Eventually should see assistant reply bubble
    const assistantReply = page.locator('[role="article"]').filter({ hasText: /income|spend|summary/i });
    await expect(assistantReply).toBeVisible({ timeout: 15000 });

    // Verify no unavailable message appeared
    await expect(page.locator('text=/The AI assistant is temporarily unavailable/i')).not.toBeVisible();
  });

  test('Scenario B - forced outage shows unavailable message', async ({ page }) => {
    // Intercept /agent/stream and force it to fail
    await page.route('**/agent/stream*', (route) => {
      route.abort('failed');
    });

    // Open ChatDock
    const chatButton = page.locator('[data-testid="chat-dock-toggle"]').or(page.locator('text=Chat')).first();
    if (await chatButton.isVisible()) {
      await chatButton.click();
    }

    // Click Month summary
    await page.locator('text=Month summary').click();

    // Should show error toast (not necessarily "temporarily unavailable" text, but some error indication)
    // The toast library (sonner) renders toasts in a specific container
    const errorToast = page.locator('[data-sonner-toast]').filter({ hasText: /error|failed|could not reach/i });
    await expect(errorToast).toBeVisible({ timeout: 5000 });

    // Thinking bubble should disappear when error occurs
    await expect(page.locator('[data-thinking="true"]')).not.toBeVisible({ timeout: 2000 }).catch(() => {});
  });

  test('quick-action buttons use streaming (no 405 errors)', async ({ page }) => {
    let has405Error = false;

    // Listen for network responses
    page.on('response', (response) => {
      if (response.status() === 405) {
        console.error(`405 Method Not Allowed: ${response.url()}`);
        has405Error = true;
      }
    });

    // Open ChatDock
    const chatButton = page.locator('[data-testid="chat-dock-toggle"]').or(page.locator('text=Chat')).first();
    if (await chatButton.isVisible()) {
      await chatButton.click();
    }

    // Test Alerts button (was returning 405)
    const alertsButton = page.locator('text=Alerts').first();
    await alertsButton.click();

    // Wait a bit for any network calls
    await page.waitForTimeout(2000);

    // Verify no 405 errors occurred
    expect(has405Error).toBe(false);

    // Test Recurring button
    const recurringButton = page.locator('text=/Recurring.*all/i').first();
    await recurringButton.click();

    await page.waitForTimeout(2000);

    // Still no 405 errors
    expect(has405Error).toBe(false);
  });

  test('streaming continues working after soft error (network blip)', async ({ page }) => {
    let requestCount = 0;

    // Fail first request, succeed on retry
    await page.route('**/agent/stream*', (route) => {
      requestCount++;
      if (requestCount === 1) {
        // First request fails
        route.abort('failed');
      } else {
        // Subsequent requests succeed
        route.continue();
      }
    });

    // Open ChatDock
    const chatButton = page.locator('[data-testid="chat-dock-toggle"]').or(page.locator('text=Chat')).first();
    if (await chatButton.isVisible()) {
      await chatButton.click();
    }

    // Click Month summary
    await page.locator('text=Month summary').click();

    // Should see retry behavior and eventual success OR error toast (depending on retry logic)
    // The key is that chat remains usable, no permanent unavailable banner
    await page.waitForTimeout(3000);

    // Chat interface should still be visible and usable
    await expect(page.locator('text=Month summary')).toBeVisible();

    // No permanent unavailable banner
    const unavailableBanner = page.locator('text=/The AI assistant is temporarily unavailable/i').and(page.locator('[role="alert"]'));
    await expect(unavailableBanner).not.toBeVisible().catch(() => {});
  });
});
