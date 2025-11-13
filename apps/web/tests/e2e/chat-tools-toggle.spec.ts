import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test.describe('@prod-critical Chat Tools Toggle', () => {
  test('toggles tools panel inside chat iframe', async ({ page }) => {
    // Use minimal-UI URL to avoid overlay interference
    await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);
    
    // Wait for iframe wrapper to exist
    const iframeWrapper = page.getByTestId('lm-chat-iframe');
    await expect(iframeWrapper).toBeVisible();

    // Chat frame (same-origin)
    const frame = page.frameLocator('[data-testid="lm-chat-iframe"] iframe');

    const toggle = frame.getByTestId('chat-tools-toggle');
    await toggle.waitFor({ state: 'visible' });

    // Get initial tools state
    const initialState = await iframeWrapper.getAttribute('data-tools-open');
    
    // Click toggle - state should flip
    await toggle.click();
    const afterFirstClick = await iframeWrapper.getAttribute('data-tools-open');
    expect(afterFirstClick).not.toBe(initialState);
    
    // Click again - should return to initial state
    await toggle.click();
    const afterSecondClick = await iframeWrapper.getAttribute('data-tools-open');
    expect(afterSecondClick).toBe(initialState);
  });
});
