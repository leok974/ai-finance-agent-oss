import { test, expect } from '@playwright/test';

test.describe('Dev Model Toggle', () => {
  test('shows checkmark on selected model and changes model override', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Wait for page to load
    await page.waitForSelector('body', { timeout: 10000 });

    // Unlock dev tools first
    // Open Account menu
    await page.getByRole('button', { name: /account/i }).click();

    // Find and click "Unlock Dev Tools" option
    await page.getByText(/unlock dev/i).click();

    // Enter PIN (assuming default dev PIN)
    const pinInput = page.getByLabel(/pin/i);
    await pinInput.fill('01324821');

    // Submit PIN
    await page.getByRole('button', { name: /unlock/i }).click();

    // Wait for unlock confirmation
    await page.waitForTimeout(500);

    // Open Dev menu
    await page.getByRole('button', { name: /dev/i }).click();

    // Click llama3 (Fast) - using test ID
    const fastCheckbox = page.getByTestId('dev-model-fast');
    await expect(fastCheckbox).toBeVisible();

    // If no initial model, clicking should check it
    await fastCheckbox.click();

    // Wait for state update
    await page.waitForTimeout(300);

    // Verify sessionStorage was updated
    const modelAfterFast = await page.evaluate(() => sessionStorage.getItem('fa.model'));
    expect(modelAfterFast).toBe('llama3:latest');

    // Close and reopen menu to verify checkmark persists
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /dev/i }).click();

    // Verify fast is checked
    await expect(fastCheckbox).toHaveAttribute('data-state', 'checked');

    // Click 20B model
    const heavyCheckbox = page.getByTestId('dev-model-20b');
    await expect(heavyCheckbox).toBeVisible();
    await expect(heavyCheckbox).not.toHaveAttribute('data-state', 'checked');

    await heavyCheckbox.click();
    await page.waitForTimeout(300);

    // Verify sessionStorage changed to heavy model
    const modelAfterHeavy = await page.evaluate(() => sessionStorage.getItem('fa.model'));
    expect(modelAfterHeavy).toBe('gpt-oss:20b');

    // Close and reopen to verify
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /dev/i }).click();

    // Verify heavy is now checked and fast is not
    await expect(heavyCheckbox).toHaveAttribute('data-state', 'checked');
    await expect(fastCheckbox).not.toHaveAttribute('data-state', 'checked');

    // Click heavy again to uncheck (clear override)
    await heavyCheckbox.click();
    await page.waitForTimeout(300);

    // Verify sessionStorage was cleared
    const modelAfterClear = await page.evaluate(() => sessionStorage.getItem('fa.model'));
    expect(modelAfterClear).toBeNull();
  });

  test('injects model override in LLM API calls', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Wait for page to load
    await page.waitForSelector('body', { timeout: 10000 });

    // Set up route intercept BEFORE any interactions
    let capturedModel: string | null = null;
    await page.route('**/agent/describe/*', async (route) => {
      const postData = route.request().postData();
      if (postData) {
        try {
          const body = JSON.parse(postData);
          capturedModel = body.model || null;
        } catch {
          // ignore parse errors
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ why: 'Test response', llm_called: true, rephrased: true }),
      });
    });

    // Set model directly via sessionStorage
    await page.evaluate(() => {
      sessionStorage.setItem('fa.model', 'llama3:latest');
    });

    // Reload to pick up the model override
    await page.reload();
    await page.waitForSelector('body', { timeout: 10000 });

    // Now trigger a tooltip describe call
    const helpButtons = await page.$$('[aria-label="Card help"]');
    if (helpButtons.length > 0) {
      await helpButtons[0].click();

      // Wait for popover
      await page.waitForSelector('[data-popover-role="card-help"]', { state: 'visible', timeout: 5000 });

      // Switch to Why tab to trigger LLM call
      const whyTab = page.getByRole('button', { name: /^why$/i }).first();
      await whyTab.click();

      // Wait for API call to complete
      await page.waitForTimeout(1000);

      // Verify model was injected
      expect(capturedModel).toBe('llama3:latest');
    }
  });

  test('only shows llama3 and gpt-oss models', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Wait for page
    await page.waitForSelector('body', { timeout: 10000 });

    // Unlock dev tools
    await page.evaluate(() => {
      sessionStorage.setItem('fa.dev.unlocked.v1', '1');
    });

    await page.reload();
    await page.waitForSelector('body', { timeout: 10000 });

    // Open Dev menu
    const devButton = page.getByRole('button', { name: /dev/i });
    await devButton.click();

    // Wait for menu to be visible
    await page.waitForSelector('[role="menu"]', { state: 'visible', timeout: 2000 });

    // Verify only llama3 and gpt-oss are shown
    await expect(page.getByTestId('dev-model-fast')).toBeVisible();
    await expect(page.getByTestId('dev-model-20b')).toBeVisible();

    // Verify the text content
    await expect(page.getByTestId('dev-model-fast')).toContainText('llama3');
    await expect(page.getByTestId('dev-model-20b')).toContainText('gpt-oss');

    // Verify nomic-embed-text is NOT shown
    const menuItems = await page.$$('[role="menuitemcheckbox"]');
    expect(menuItems.length).toBe(2); // Only 2 model checkboxes

    // Verify no "default" or "nomic" text appears
    const menuText = await page.locator('[role="menu"]').textContent();
    expect(menuText).not.toContain('nomic');
    expect(menuText).not.toContain('embed');
  });

  test('persists model override per tab in sessionStorage', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173');

    // Set model override
    await page.evaluate(() => {
      sessionStorage.setItem('fa.model', 'gpt-oss:20b');
    });

    // Reload page
    await page.reload();

    // Wait for page load
    await page.waitForSelector('body', { timeout: 10000 });

    // Verify model override persisted
    const modelOverride = await page.evaluate(() => sessionStorage.getItem('fa.model'));
    expect(modelOverride).toBe('gpt-oss:20b');

    // Verify it shows checked in dev menu (if unlocked)
    await page.evaluate(() => {
      sessionStorage.setItem('fa.dev.unlocked.v1', '1');
    });
    await page.reload();
    await page.waitForSelector('body', { timeout: 10000 });

    const devButton = page.getByRole('button', { name: /dev/i });
    if (await devButton.isVisible()) {
      await devButton.click();
      await page.waitForTimeout(300);

      const heavyCheckbox = page.getByTestId('dev-model-20b');
      await expect(heavyCheckbox).toHaveAttribute('data-state', 'checked');
    }
  });
});
