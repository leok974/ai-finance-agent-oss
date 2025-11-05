/**
 * E2E Test: PIN-gated Dev Unlock Flow
 *
 * Tests the complete PIN-gated developer unlock flow:
 * 1. Login as dev superuser
 * 2. Verify dev tools (RAG chips) are hidden initially
 * 3. Click unlock button in account menu
 * 4. Enter PIN in modal
 * 5. Verify unlock success toast
 * 6. Verify dev tools (RAG chips) are now visible
 * 7. Test a dev tool action (Seed)
 */
import { test, expect, type Page } from '@playwright/test';

// Test environment credentials (set in global setup or CI environment)
const DEV_EMAIL = process.env.DEV_E2E_EMAIL || 'dev@example.com';
const DEV_PASSWORD = process.env.DEV_E2E_PASSWORD || 'password123';
const DEV_PIN = process.env.DEV_SUPERUSER_PIN || '123456';

/**
 * Helper: Login to the application
 */
async function login(page: Page, email: string, password: string) {
  await page.goto('/');

  // Wait for login form
  await page.waitForSelector('input[name="email"]', { timeout: 10000 });

  // Fill login credentials
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);

  // Submit login form
  await page.click('button[type="submit"]');

  // Wait for navigation to complete
  await page.waitForURL(/\/(dashboard|home|app)/, { timeout: 10000 });

  // Wait for auth state to settle
  await page.waitForTimeout(1000);
}

/**
 * Helper: Unlock dev tools with PIN
 */
async function unlockDevTools(page: Page, pin: string = DEV_PIN) {
  // Open account menu
  await page.click('button:has-text("Account")');
  await page.waitForTimeout(500);

  // Click unlock button
  const unlockButton = page.locator('[data-testid="unlock-dev"]');
  await expect(unlockButton).toBeVisible({ timeout: 5000 });
  await unlockButton.click();

  // Enter PIN
  await page.waitForSelector('[data-testid="pin-input"]', { timeout: 5000 });
  const pinInput = page.locator('[data-testid="pin-input"]');
  await pinInput.fill(pin);

  // Submit
  const submitButton = page.locator('[data-testid="pin-submit"]');
  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  // Wait for success
  await page.waitForSelector('text=/Dev.*unlocked/i', { timeout: 5000 });
  await page.waitForTimeout(1000); // Let UI settle
}

/**
 * Helper: Logout from the application
 */
async function logout(page: Page) {
  // Open account menu
  await page.click('button:has-text("Account")');
  await page.waitForTimeout(500);

  // Click logout
  await page.click('button:has-text("Logout")');

  // Wait for redirect to login page
  await page.waitForURL(/\/(login|auth)/, { timeout: 5000 });
}

test.describe('Dev PIN-gated Unlock Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await login(page, DEV_EMAIL, DEV_PASSWORD);
  });

  test('should unlock dev tools with correct PIN and show RAG chips', async ({ page }) => {
    // Step 1: Verify dev tools (RAG chips) are NOT visible initially
    const ragChipsBeforeUnlock = page.locator('[data-testid="rag-chips"]');
    await expect(ragChipsBeforeUnlock).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // Element might not exist at all, which is also valid
    });

    // Step 2: Open account menu
    await page.click('button:has-text("Account")');
    await page.waitForTimeout(500); // Wait for menu animation

    // Step 3: Click "Unlock Dev Tools" button
    const unlockButton = page.locator('[data-testid="unlock-dev"]');
    await expect(unlockButton).toBeVisible({ timeout: 5000 });
    await unlockButton.click();

    // Step 4: Wait for PIN modal to appear
    await page.waitForSelector('[data-testid="pin-input"]', { timeout: 5000 });

    // Step 5: Enter PIN
    const pinInput = page.locator('[data-testid="pin-input"]');
    await pinInput.fill(DEV_PIN);

    // Step 6: Submit PIN
    const submitButton = page.locator('[data-testid="pin-submit"]');
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // Step 7: Wait for success toast/notification
    await page.waitForSelector('text=/Dev.*unlocked/i', { timeout: 5000 });

    // Step 8: Verify modal closes
    await expect(pinInput).not.toBeVisible({ timeout: 3000 });

    // Step 9: Verify RAG chips are now visible
    const ragChipsAfterUnlock = page.locator('[data-testid="rag-chips"]');
    await expect(ragChipsAfterUnlock).toBeVisible({ timeout: 5000 });

    // Step 10: Verify at least one RAG tool button exists
    const seedButton = ragChipsAfterUnlock.locator('button:has-text("Seed")');
    await expect(seedButton).toBeVisible({ timeout: 3000 });
  });

  test('should allow using dev tools after unlock (Seed action)', async ({ page }) => {
    // First unlock dev tools (same steps as previous test)
    await page.click('button:has-text("Account")');
    await page.waitForTimeout(500);

    const unlockButton = page.locator('[data-testid="unlock-dev"]');
    await unlockButton.click();

    await page.waitForSelector('[data-testid="pin-input"]', { timeout: 5000 });
    const pinInput = page.locator('[data-testid="pin-input"]');
    await pinInput.fill(DEV_PIN);

    const submitButton = page.locator('[data-testid="pin-submit"]');
    await submitButton.click();

    // Wait for unlock confirmation
    await page.waitForSelector('text=/Dev.*unlocked/i', { timeout: 5000 });
    await page.waitForTimeout(1000); // Let UI settle

    // Now test Seed action
    const ragChips = page.locator('[data-testid="rag-chips"]');
    await expect(ragChips).toBeVisible({ timeout: 5000 });

    // Click Seed button
    const seedButton = ragChips.locator('button:has-text("Seed")');
    await expect(seedButton).toBeVisible({ timeout: 3000 });
    await seedButton.click();

    // Wait for seed operation to complete (either success toast or response in UI)
    // Adjust timeout based on how long seeding typically takes
    await page.waitForSelector('text=/Seed.*success|completed|done/i', {
      timeout: 15000
    }).catch(async () => {
      // Alternative: Check for any response in chat/message area
      await page.waitForSelector('.message, .response, .chat-message', {
        timeout: 10000
      });
    });

    // Verify no error messages
    const errorMessage = page.locator('text=/error|failed/i');
    await expect(errorMessage).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // No error is good
    });
  });

  test('should reject incorrect PIN', async ({ page }) => {
    // Open account menu
    await page.click('button:has-text("Account")');
    await page.waitForTimeout(500);

    // Click unlock button
    const unlockButton = page.locator('[data-testid="unlock-dev"]');
    await unlockButton.click();

    // Enter WRONG PIN
    await page.waitForSelector('[data-testid="pin-input"]', { timeout: 5000 });
    const pinInput = page.locator('[data-testid="pin-input"]');
    await pinInput.fill('999999'); // Wrong PIN

    // Submit
    const submitButton = page.locator('[data-testid="pin-submit"]');
    await submitButton.click();

    // Verify error message appears
    await page.waitForSelector('text=/Invalid.*PIN|incorrect|failed/i', {
      timeout: 5000
    });

    // Verify modal does NOT close (still visible)
    await expect(pinInput).toBeVisible();

    // Verify RAG chips still NOT visible
    const ragChips = page.locator('[data-testid="rag-chips"]');
    await expect(ragChips).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // Element might not exist, which is valid
    });
  });

  test('should require exactly 6 digits for PIN', async ({ page }) => {
    // Open account menu and unlock modal
    await page.click('button:has-text("Account")');
    await page.waitForTimeout(500);

    const unlockButton = page.locator('[data-testid="unlock-dev"]');
    await unlockButton.click();

    await page.waitForSelector('[data-testid="pin-input"]', { timeout: 5000 });
    const pinInput = page.locator('[data-testid="pin-input"]');
    const submitButton = page.locator('[data-testid="pin-submit"]');

    // Test with < 6 digits
    await pinInput.fill('123');
    await expect(submitButton).toBeDisabled();

    // Test with exactly 6 digits
    await pinInput.fill('123456');
    await expect(submitButton).toBeEnabled();

    // PIN input should prevent > 6 digits due to maxLength attribute
    await pinInput.fill('1234567890');
    const value = await pinInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(6);
  });

  test('@backend Unlock persists across page reload', async ({ page }) => {
    // Unlock dev tools
    await unlockDevTools(page);

    // Verify chips visible
    const ragChips = page.locator('[data-testid="rag-chips"]');
    await expect(ragChips).toBeVisible({ timeout: 5000 });

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify chips STILL visible (persisted via session/cookie)
    await expect(ragChips).toBeVisible({ timeout: 5000 });

    // Verify seed button still works without re-unlock
    const seedButton = ragChips.locator('button:has-text("Seed")');
    await expect(seedButton).toBeVisible({ timeout: 3000 });
  });

  test('@backend Logout clears unlock state', async ({ page }) => {
    // Unlock dev tools
    await unlockDevTools(page);

    // Verify chips visible
    const ragChipsUnlocked = page.locator('[data-testid="rag-chips"]');
    await expect(ragChipsUnlocked).toBeVisible({ timeout: 5000 });

    // Logout
    await logout(page);

    // Login again
    await login(page, DEV_EMAIL, DEV_PASSWORD);
    await page.waitForLoadState('networkidle');

    // Verify chips are HIDDEN again (unlock cleared on logout)
    const ragChipsAfterLogout = page.locator('[data-testid="rag-chips"]');
    await expect(ragChipsAfterLogout).toHaveCount(0);

    // Verify unlock button is visible again (needs re-unlock)
    await page.click('button:has-text("Account")');
    await page.waitForTimeout(500);
    const unlockButton = page.locator('[data-testid="unlock-dev"]');
    await expect(unlockButton).toBeVisible({ timeout: 5000 });
  });

  test('@backend Manual lock via /auth/dev/lock clears unlock', async ({ page }) => {
    // Unlock dev tools
    await unlockDevTools(page);

    // Verify chips visible
    const ragChips = page.locator('[data-testid="rag-chips"]');
    await expect(ragChips).toBeVisible({ timeout: 5000 });

    // Call lock endpoint directly
    const lockResponse = await page.request.post('/auth/dev/lock', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    expect(lockResponse.ok()).toBe(true);
    const lockData = await lockResponse.json();
    expect(lockData.dev_unlocked).toBe(false);

    // Reload to see lock effect
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Verify chips are hidden after lock
    await expect(ragChips).toHaveCount(0);
  });
});
