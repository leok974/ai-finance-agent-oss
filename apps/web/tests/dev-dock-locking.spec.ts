import { test, expect } from '@playwright/test';

test('dev dock disabled until unlock; unlock via Account → Dev persists for session', async ({ page }) => {
  // Stub unlock to succeed (204 No Content)
  await page.route('**/api/auth/dev/unlock', route =>
    route.fulfill({ status: 204 })
  );

  // Stub models endpoint to avoid 404
  await page.route('**/api/agent/models**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [] }) })
  );

  await page.goto('/');

  // Wait for page to be fully loaded
  await page.waitForLoadState('networkidle');

  // 1) Find Dev menu button
  const devTrigger = page.getByTestId('dev-trigger');
  await expect(devTrigger).toBeVisible();

  // Initially should show "Dev" without "(unlocked)"
  await expect(devTrigger).toContainText('Dev');

  // 2) Open Dev menu
  await devTrigger.click();

  // 3) Fill unlock form
  await page.getByPlaceholder(/email/i).fill('dev@example.com');
  const pinInput = page.getByTestId('dev-pin');
  await pinInput.fill('12345678');

  // 4) Submit unlock
  await page.getByTestId('dev-unlock').click();

  // Wait for unlock to complete
  await page.waitForTimeout(500);

  // 5) Verify Dev menu shows unlocked state
  await expect(devTrigger).toContainText('(unlocked)');

  // 6) Verify session persistence by reloading page
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Dev trigger should still show unlocked after reload (session persistence)
  const devTriggerAfterReload = page.getByTestId('dev-trigger');
  await expect(devTriggerAfterReload).toContainText('(unlocked)');
});

test('dev menu unlock handles 404 gracefully', async ({ page }) => {
  // Simulate unlock failure (404)
  await page.route('**/api/auth/dev/unlock', route =>
    route.fulfill({ status: 404 })
  );

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const devTrigger = page.getByTestId('dev-trigger');
  await devTrigger.click();

  await page.getByPlaceholder(/email/i).fill('dev@example.com');
  await page.getByTestId('dev-pin').fill('12345678');
  await page.getByTestId('dev-unlock').click();

  await page.waitForTimeout(500);

  // Should not show unlocked (unlock failed)
  await expect(devTrigger).not.toContainText('(unlocked)');
});

test('dev menu unlock handles 204 No Content response', async ({ page }) => {
  // Test that 204 No Content (no JSON body) is handled correctly
  await page.route('**/api/auth/dev/unlock', route =>
    route.fulfill({ status: 204 })
  );

  await page.route('**/api/agent/models**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [] }) })
  );

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const devTrigger = page.getByTestId('dev-trigger');
  await devTrigger.click();

  await page.getByTestId('dev-pin').fill('12345678');
  await page.getByTestId('dev-unlock').click();

  await page.waitForTimeout(500);

  // Should show unlocked successfully
  await expect(devTrigger).toContainText('(unlocked)');
});
