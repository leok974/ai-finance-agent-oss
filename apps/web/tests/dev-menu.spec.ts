import { test, expect } from '@playwright/test';

test.describe('Unified Dev menu + /api routing', () => {
  test('exactly one Dev button, unlock flow, and /api agent/models call (no 404)', async ({ page }) => {
    // --- Intercepts we control to make the test independent of the backend ---
    // 1) Unlock endpoint: pretend success so we can enter the unlocked state
    await page.route('**/api/auth/dev/unlock', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    });

    // 2) Agent models endpoint: must be called via /api to pass; fulfill a stub
    let modelsRequestSeen = false;
    await page.route('**/api/agent/models**', async (route) => {
      modelsRequestSeen = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ models: [] }),
      });
    });

    // 3) Guard against any WRONG calls to /agent/models (missing /api)
    const badAgentRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      // hit /agent/models without /api in the path
      if (/\/agent\/models(\?|$)/.test(url) && !/\/api\/agent\/models/.test(url)) {
        badAgentRequests.push(url);
      }
    });

    // --- Navigate to the app ---
    await page.goto('/');

    // --- There should be exactly ONE Dev button in the header ---
    const devBtn = page.getByTestId('dev-trigger');
    await expect(devBtn).toHaveCount(1);
    await expect(devBtn).toBeVisible();

    // --- Open Dev menu ---
    await devBtn.click();

    // Unlock UI should be visible (PIN field + Unlock button)
    const pinInput = page.getByTestId('dev-pin');
    await expect(pinInput).toBeVisible();

    const unlockButton = page.getByTestId('dev-unlock');
    await expect(unlockButton).toBeVisible();

    // Enter a dummy PIN and unlock (our route stub will return 200)
    await pinInput.fill(process.env.E2E_DEV_PIN ?? '12345678');
    await unlockButton.click();

    // The trigger should now include "(unlocked)"
    await expect(devBtn).toHaveText(/Dev\s*\(unlocked\)/);

    // Re-open menu to see unlocked items
    await devBtn.click();

    // Menu items should now be visible
    await expect(page.getByTestId('dev-planner')).toBeVisible();
    await expect(page.getByTestId('dev-refresh-models')).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Seed Demo Data/i })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Clear DB/i })).toBeVisible();

    // Click "Refresh Models" → must hit /api/agent/models (we stubbed it)
    await page.getByTestId('dev-refresh-models').click();

    // Confirm the good request was seen and NO bad requests were made
    await expect.poll(() => modelsRequestSeen).toBeTruthy();
    expect(badAgentRequests, `Found non-/api agent calls: ${badAgentRequests.join(', ')}`).toHaveLength(0);
  });
});
