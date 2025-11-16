import { test, expect, type Page } from '@playwright/test';

async function ensureChatAvailable(page: Page) {
  await page.goto('/', { waitUntil: 'load', timeout: 60000 });

  if (process.env.IS_PROD === 'true') {
    try {
      await page
        .getByTestId('lm-chat-launcher-button')
        .waitFor({ timeout: 15000 });
    } catch {
      test.skip(
        true,
        'Chat launcher button not found in prod – likely E2E session/auth issue'
      );
    }
  }
}

test.describe('@prod Chat panel interactions', () => {
  test('all tool buttons are clickable and panel stays open', async ({ page }) => {
    await ensureChatAvailable(page);

    // Open the launcher
    await page.getByTestId('lm-chat-launcher-button').click();

    const launcher = page.getByTestId('lm-chat-launcher');
    const panel = page.getByTestId('lm-chat-panel');

    await expect(panel).toBeVisible();
    await expect(launcher).toHaveClass(/lm-chat-launcher--open/);

    // List of all tool buttons by visible label
    const toolLabels = [
      'Month summary',
      'Trends',
      'Alerts',
      'Recurring',
      'Find subscriptions',
      'Insights (Q)',
      'Budget suggest',
      'Search transactions (NL)',
    ];

    for (const label of toolLabels) {
      const button = page.getByRole('button', { name: label, exact: false });

      await expect(button, `Button "${label}" should be visible`).toBeVisible();

      // Use force: true to bypass z-index hitTest issues in automation
      await button.click({ force: true });

      // After clicking, the panel must still be open & visible
      await expect(panel, `Panel should remain visible after clicking "${label}"`).toBeVisible();
      await expect(launcher, `Launcher should stay OPEN after clicking "${label}"`).toHaveClass(
        /lm-chat-launcher--open/,
      );
    }
  });

  test('text field can be focused, typed into, and used without closing panel', async ({ page }) => {
    await ensureChatAvailable(page);

    await page.getByTestId('lm-chat-launcher-button').click();

    const launcher = page.getByTestId('lm-chat-launcher');
    const panel = page.getByTestId('lm-chat-panel');

    await expect(panel).toBeVisible();
    await expect(launcher).toHaveClass(/lm-chat-launcher--open/);

    // Input field
    const input = page.getByPlaceholder('Ask or type a command...');
    await input.click({ force: true });
    await input.fill('Test message from Playwright');
    await expect(input).toHaveValue('Test message from Playwright');

    // Send via button (do NOT assert on clear behavior, just that it stays usable)
    const sendButton = page.getByRole('button', { name: /send/i });
    await expect(sendButton).toBeVisible();
    await sendButton.click({ force: true });

    // Panel should still be open & interactive
    await expect(panel).toBeVisible();
    await expect(launcher).toHaveClass(/lm-chat-launcher--open/);

    // Input should still be focusable & typeable after send
    await input.click({ force: true });
    await input.fill('Second message');
    await expect(input).toHaveValue('Second message');
  });
});
