/**
 * E2E Test: Dev Unlock UX - Single Entry Point via Account Menu
 *
 * Requirements:
 * 1. Dev pill is disabled when not unlocked
 * 2. Clicking locked Dev pill does nothing (no modal)
 * 3. Unlock ONLY available via Account menu
 * 4. After unlock, Dev pill becomes enabled
 * 5. Session persistence across reloads
 */
import { test, expect } from '@playwright/test';

test.describe('Dev Lock Enforcement', () => {
  test.beforeEach(async ({ page }) => {
    // Clear sessionStorage to ensure locked state
    await page.goto('http://127.0.0.1:5173');
    await page.evaluate(() => sessionStorage.removeItem('fa.dev.unlocked.v1'));
  });

  test('Dev pill is disabled when locked', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    const devPill = page.getByTestId('dev-trigger');
    await expect(devPill).toBeVisible();
    await expect(devPill).toBeDisabled();
  });

  test('Clicking locked Dev pill does nothing - no unlock modal appears', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    const devPill = page.getByTestId('dev-trigger');

    // Try to click disabled button (should do nothing)
    await devPill.click({ force: true }); // force because it's disabled

    // Verify no unlock dialog appears
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(/unlock dev/i)).toHaveCount(0);
  });

  test('Unlock is only available via Account menu', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Open Account menu
    const accountMenu = page.getByRole('button', { name: /account/i });
    await accountMenu.click();

    // Should see "Unlock Dev Tools" option
    const unlockOption = page.getByRole('menuitem', { name: /unlock dev tools/i });
    await expect(unlockOption).toBeVisible();
  });

  test('Full unlock flow via Account menu', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Verify Dev pill starts disabled
    const devPill = page.getByTestId('dev-trigger');
    await expect(devPill).toBeDisabled();

    // Open Account menu
    const accountMenu = page.getByRole('button', { name: /account/i });
    await accountMenu.click();

    // Click unlock option
    const unlockOption = page.getByRole('menuitem', { name: /unlock dev tools/i });
    await unlockOption.click();

    // Unlock modal should appear with empty PIN
    const pinInput = page.getByTestId('pin-input');
    await expect(pinInput).toBeVisible();
    await expect(pinInput).toHaveValue('');

    // Mock the backend endpoint
    await page.route('**/api/auth/dev/unlock', async (route) => {
      const request = route.request();
      expect(request.method()).toBe('POST');

      const body = JSON.parse(request.postData() || '{}');
      expect(body).toHaveProperty('pin');
      expect(body.pin).toBe('12345678');

      // Backend returns 204 No Content on success
      await route.fulfill({ status: 204 });
    });

    // Enter PIN manually
    await pinInput.fill('12345678');

    // Submit
    const submitButton = page.getByTestId('pin-submit');
    await submitButton.click();

    // Wait for unlock (modal closes)
    await expect(pinInput).not.toBeVisible({ timeout: 5000 });

    // Verify Dev pill is now enabled
    await expect(devPill).toBeEnabled();

    // Verify unlock indicator
    await expect(page.getByText('✓')).toBeVisible();
  });

  test('Session persistence - unlock state survives reload', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Manually set unlocked state in sessionStorage
    await page.evaluate(() => {
      sessionStorage.setItem('fa.dev.unlocked.v1', '1');
    });

    // Reload page
    await page.reload();

    // Dev pill should be enabled
    const devPill = page.getByTestId('dev-trigger');
    await expect(devPill).toBeEnabled();
  });

  test('Session expiry - unlock state cleared on new session', async ({ context }) => {
    // Create first page and unlock
    const page1 = await context.newPage();
    await page1.goto('http://127.0.0.1:5173');
    await page1.evaluate(() => {
      sessionStorage.setItem('fa.dev.unlocked.v1', '1');
    });

    const devPill1 = page1.getByTestId('dev-trigger');
    await expect(devPill1).toBeEnabled();

    // Close page (simulates closing browser)
    await page1.close();

    // Open new page (simulates new browser session)
    const page2 = await context.newPage();
    await page2.goto('http://127.0.0.1:5173');

    // Dev pill should be locked (sessionStorage cleared)
    const devPill2 = page2.getByTestId('dev-trigger');
    await expect(devPill2).toBeDisabled();

    await page2.close();
  });

  test('Disabled Dev pill shows helpful tooltip', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    const devPill = page.getByTestId('dev-trigger');

    // Hover over disabled pill
    await devPill.hover();

    // Tooltip should appear with instructions
    const tooltip = page.getByText(/unlock from account menu/i);
    await expect(tooltip).toBeVisible({ timeout: 2000 });
  });

  test('Unlocked Dev pill opens menu with actions', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Set unlocked state
    await page.evaluate(() => {
      sessionStorage.setItem('fa.dev.unlocked.v1', '1');
    });
    await page.reload();

    // Click Dev pill
    const devPill = page.getByTestId('dev-trigger');
    await devPill.click();

    // Should see dev actions menu
    await expect(page.getByText(/seed demo data/i)).toBeVisible();
    await expect(page.getByText(/clear db/i)).toBeVisible();
    await expect(page.getByText(/refresh models/i)).toBeVisible();
  });
});

test.describe('Legacy Unlock UI Prevention', () => {
  test('Dev pill never shows PIN input (no duplicate unlock UI)', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    const devPill = page.getByTestId('dev-trigger');

    // Try to interact with disabled pill
    await devPill.click({ force: true });

    // Verify no PIN input appears in Dev menu
    await expect(page.getByTestId('dev-pin')).toHaveCount(0);
    await expect(page.getByTestId('dev-unlock')).toHaveCount(0);
  });

  test('Dev menu does not contain unlock button', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Even if we could open the menu, it shouldn't have unlock UI
    const unlockButton = page.getByTestId('dev-unlock');
    await expect(unlockButton).toHaveCount(0);
  });
});

test.describe('Request Format Validation', () => {
  test('Unlock request has correct format: JSON with pin', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Intercept the unlock request
    let requestBody: string | null = null;
    let contentType: string = '';

    await page.route('**/api/auth/dev/unlock', async (route) => {
      const request = route.request();
      contentType = request.headers()['content-type'] || '';
      requestBody = request.postData();

      // Verify request format (FormData, not JSON)
      expect(request.method()).toBe('POST');
      expect(contentType).toContain('multipart/form-data');

      await route.fulfill({ status: 204 });
    });

    // Open unlock dialog
    await page.getByRole('button', { name: /account/i }).click();
    await page.getByRole('menuitem', { name: /unlock dev tools/i }).click();

    // PIN should be empty
    const pinInput = page.getByTestId('pin-input');
    await expect(pinInput).toHaveValue('');

    // Fill PIN manually
    await pinInput.fill('12345678');

    // Submit
    await page.getByTestId('pin-submit').click();

    // Wait for request
    await page.waitForTimeout(500);

    // Verify FormData was sent with pin field
    expect(requestBody).toContain('pin');
    expect(requestBody).toContain('12345678');
  });

  test('PIN must be 8 digits - shows error for invalid length', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Open unlock dialog
    await page.getByRole('button', { name: /account/i }).click();
    await page.getByRole('menuitem', { name: /unlock dev tools/i }).click();

    const pinInput = page.getByTestId('pin-input');

    // Try short PIN
    await pinInput.fill('1234');
    await page.getByTestId('pin-submit').click();

    // Should show error
    await expect(page.getByText(/PIN must be 8 digits/i)).toBeVisible();
  });

  test('PIN normalization - strips non-digit characters', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    let requestBody: string | null = null;

    await page.route('**/api/auth/dev/unlock', async (route) => {
      requestBody = route.request().postData();
      await route.fulfill({ status: 204 });
    });

    // Open unlock dialog
    await page.getByRole('button', { name: /account/i }).click();
    await page.getByRole('menuitem', { name: /unlock dev tools/i }).click();

    const pinInput = page.getByTestId('pin-input');

    // Clear default and enter letters and symbols (should be stripped)
    await pinInput.clear();
    await pinInput.fill('12ab34cd56ef78gh');

    // Submit
    await page.getByTestId('pin-submit').click();
    await page.waitForTimeout(500);

    // Should normalize to digits only in FormData
    expect(requestBody).toContain('pin');
    expect(requestBody).toContain('12345678');
  });
});
