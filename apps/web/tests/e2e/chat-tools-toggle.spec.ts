import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

test.describe('@prod-critical Chat Tools Toggle', () => {
  test('toggles tools panel inside chat iframe', async ({ page }) => {
    // Use minimal-UI URL to avoid overlay interference
    await page.goto(`${BASE_URL}/?chat=1&prefetch=0&panel=0`);

    // Wait for iframe element to exist (created by mountChat.tsx)
    const iframeElement = page.locator('#lm-chat-iframe');
    await expect(iframeElement).toBeVisible();

    // Access the frame content (ChatIframe.tsx renders inside)
    const frame = page.frameLocator('#lm-chat-iframe');

    // The wrapper div INSIDE the iframe has data-tools-open
    const chatWrapper = frame.locator('[data-testid="lm-chat-iframe"]');
    const toggle = frame.getByTestId('chat-tools-toggle');

    await toggle.waitFor({ state: 'visible' });

    // Get initial tools state from the wrapper inside the iframe
    const initialState = await chatWrapper.getAttribute('data-tools-open');

    // Click toggle - state should flip (force to bypass header interception)
    await toggle.click({ force: true });

    // Wait a moment for React to process the state update
    await page.waitForTimeout(500);

    // Check if state changed
    const afterFirstClick = await chatWrapper.getAttribute('data-tools-open');
    expect(afterFirstClick).not.toBe(initialState);

    // Click again - should return to initial state
    await toggle.click({ force: true });
    await page.waitForTimeout(500);
    const afterSecondClick = await chatWrapper.getAttribute('data-tools-open');
    expect(afterSecondClick).toBe(initialState);
  });
});
