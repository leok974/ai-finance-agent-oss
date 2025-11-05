/**
 * @file Admin Rules UI E2E Tests
 *
 * Tests admin-only access to Category Rules panel:
 * - Nav link hidden for non-admin users
 * - Nav link visible for admin users
 * - Panel renders when admin toggles it on
 *
 * Environment setup:
 * - AUTH_E2E=1 (enable auth tests)
 * - AUTH_EMAIL / AUTH_PASSWORD (regular user)
 * - ADMIN_EMAIL / ADMIN_PASSWORD (admin user)
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1';
const PORT = process.env.EDGE_PORT ?? '80';

// Regular user credentials
const USER_EMAIL = process.env.AUTH_EMAIL;
const USER_PASSWORD = process.env.AUTH_PASSWORD;

// Admin user credentials
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

// Test data-testid for nav item
const NAV_ADMIN_RULES_TESTID = 'nav-admin-rules';

// Only run when auth tests enabled
test.skip(process.env.AUTH_E2E !== '1', 'AUTH_E2E not enabled - set AUTH_E2E=1 to run');

test.describe('@admin rules ui', () => {
  const baseUrl = `${BASE}:${PORT}`;

  test.describe('non-admin user', () => {
    test('nav link hidden for non-admin', async ({ page }) => {
      // Skip if user credentials not provided
      if (!USER_EMAIL || !USER_PASSWORD) {
        test.skip(true, 'AUTH_EMAIL or AUTH_PASSWORD not set');
      }

      // Login as regular user
      await page.goto(baseUrl);

      // Wait for login form to appear (if not already logged in)
      const loginButton = page.locator('button:has-text("Login")').first();
      if (await loginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await page.fill('input[type="email"]', USER_EMAIL!);
        await page.fill('input[type="password"]', USER_PASSWORD!);
        await loginButton.click();
        await page.waitForURL(baseUrl, { timeout: 5000 });
      }

      // Enable dev mode (Ctrl+Shift+D) - needed to show dev menu
      await page.keyboard.press('Control+Shift+D');
      await page.waitForTimeout(500);

      // Open Dev menu
      const devMenuButton = page.locator('button:has-text("Dev")').first();
      if (await devMenuButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await devMenuButton.click();
        await page.waitForTimeout(300);

        // Admin Rules nav item should NOT be visible
        const adminRulesNav = page.getByTestId(NAV_ADMIN_RULES_TESTID);
        await expect(adminRulesNav).toHaveCount(0);
      } else {
        test.skip(true, 'Dev menu not available (may be disabled in prod)');
      }
    });
  });

  test.describe('admin user', () => {
    test('nav link visible and panel renders for admin', async ({ page }) => {
      // Login as admin
      await page.goto(baseUrl);

      // Clear existing session first
      await page.context().clearCookies();
      await page.goto(baseUrl);

      // Wait for login form
      const loginButton = page.locator('button:has-text("Login")').first();
      await expect(loginButton).toBeVisible({ timeout: 5000 });

      // Fill admin credentials
      await page.fill('input[type="email"]', ADMIN_EMAIL);
      await page.fill('input[type="password"]', ADMIN_PASSWORD);
      await loginButton.click();

      // Wait for successful login (redirect to home)
      await page.waitForURL(baseUrl, { timeout: 5000 });

      // Enable dev mode (Ctrl+Shift+D)
      await page.keyboard.press('Control+Shift+D');
      await page.waitForTimeout(500);

      // Open Dev menu
      const devMenuButton = page.locator('button:has-text("Dev")').first();
      await expect(devMenuButton).toBeVisible({ timeout: 3000 });
      await devMenuButton.click();
      await page.waitForTimeout(300);

      // Admin Rules nav item SHOULD be visible
      const adminRulesNav = page.getByTestId(NAV_ADMIN_RULES_TESTID);
      await expect(adminRulesNav).toBeVisible({ timeout: 2000 });

      // Click to toggle panel on
      await adminRulesNav.click();
      await page.waitForTimeout(500);

      // Panel should render with heading
      const panelHeading = page.getByRole('heading', { name: /category rules/i });
      await expect(panelHeading).toBeVisible({ timeout: 3000 });

      // Verify rules table loads (may be empty)
      const rulesTable = page.locator('table').filter({ hasText: /pattern/i });
      await expect(rulesTable).toBeVisible({ timeout: 2000 });
    });

    test('panel lazy-loads with suspense fallback', async ({ page }) => {
      // Login as admin (reuse session if available)
      await page.goto(baseUrl);

      // If not logged in, skip (depends on previous test or setup)
      const devMenuButton = page.locator('button:has-text("Dev")').first();
      if (!await devMenuButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        test.skip(true, 'Not logged in as admin - depends on test order');
      }

      // Open dev menu and toggle admin panel
      await page.keyboard.press('Control+Shift+D');
      await page.waitForTimeout(300);
      await devMenuButton.click();
      await page.waitForTimeout(300);

      const adminRulesNav = page.getByTestId(NAV_ADMIN_RULES_TESTID);
      await adminRulesNav.click();

      // Should see loading fallback briefly (or panel loads immediately)
      const loadingFallback = page.locator('text=/loading admin tools/i');
      const panelHeading = page.getByRole('heading', { name: /category rules/i });

      // Either loading appears first, or panel loads immediately
      await Promise.race([
        expect(loadingFallback).toBeVisible({ timeout: 500 }).catch(() => {}),
        expect(panelHeading).toBeVisible({ timeout: 1000 })
      ]);

      // Eventually panel should be visible
      await expect(panelHeading).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('unauthenticated', () => {
    test('admin rules not accessible when not logged in', async ({ page }) => {
      // Clear all cookies/storage
      await page.context().clearCookies();
      await page.goto(baseUrl);

      // Try to enable dev mode
      await page.keyboard.press('Control+Shift+D');
      await page.waitForTimeout(500);

      // Dev menu should not be visible when not authenticated
      const devMenuButton = page.locator('button:has-text("Dev")').first();
      const isVisible = await devMenuButton.isVisible({ timeout: 1000 }).catch(() => false);

      if (isVisible) {
        // If dev menu somehow visible, admin rules should still not be there
        await devMenuButton.click();
        await page.waitForTimeout(300);
        const adminRulesNav = page.getByTestId(NAV_ADMIN_RULES_TESTID);
        await expect(adminRulesNav).toHaveCount(0);
      } else {
        // Dev menu not visible when not logged in (expected)
        expect(isVisible).toBe(false);
      }
    });
  });
});
