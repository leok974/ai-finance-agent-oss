// tests/e2e/chat-actions.spec.ts
import { test, expect } from '@playwright/test';

// Use authenticated state from existing setup
test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

async function openChat(page) {
  await page.goto(BASE_URL);
  const launcher = page.getByTestId('lm-chat-launcher-button');

  await expect(launcher).toBeVisible();
  await launcher.click();

  const panel = page.getByTestId('lm-chat-panel');
  await expect(panel).toBeVisible();

  const launcherRoot = page.getByTestId('lm-chat-launcher');
  await expect(launcherRoot).toHaveAttribute('data-state', 'open');

  return { launcher, launcherRoot, panel };
}

test.describe('ChatDock actions (v2) @prod', () => {
  test('launcher toggles chat open/closed', async ({ page }) => {
    await page.goto(BASE_URL);

    const launcher = page.getByTestId('lm-chat-launcher-button');
    const launcherRoot = page.getByTestId('lm-chat-launcher');

    // initial state: closed
    await expect(launcher).toBeVisible();
    await expect(launcherRoot).toHaveAttribute('data-state', 'closed');

    // open
    await launcher.click();
    await expect(launcherRoot).toHaveAttribute('data-state', 'open');
    await expect(page.getByTestId('lm-chat-panel')).toBeVisible();

    // close
    await launcher.click();
    await expect(launcherRoot).toHaveAttribute('data-state', 'closed');
  });

  test('all tool buttons are clickable and keep panel open', async ({ page }) => {
    const { panel } = await openChat(page);

    const toolsArea = page.getByTestId('lm-chat-scroll');
    await expect(toolsArea).toBeVisible();

    const buttons = toolsArea.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const label = (await btn.innerText()).trim();

      await btn.scrollIntoViewIfNeeded();
      await btn.click();

      // Panel must stay visible after each tool click
      await expect(
        panel,
        `Chat panel should remain open after clicking tool[${i}] "${label}"`,
      ).toBeVisible();
    }
  });

  test('composer accepts text and Send keeps panel open', async ({ page }) => {
    const { panel } = await openChat(page);

    // Input: either by testid or known placeholder
    const composer =
      page.getByTestId('lm-chat-input').or(
        page.getByPlaceholder('Ask or type a command...'),
      );

    await expect(composer).toBeVisible();
    await composer.click();
    await composer.fill('What are my top merchants this month?');

    // Try to find a send button in the footer area
    const footer = panel.locator('[data-testid="lm-chat-footer"], footer, .lm-chat-footer').first();
    const sendButton = footer.locator('button:has-text("Send"), button:has-text("Run"), button:has-text("Ask")').first();

    // If we can't find a dedicated send button, just press Enter
    if ((await sendButton.count()) > 0) {
      await sendButton.click();
    } else {
      await composer.press('Enter');
    }

    // Panel should remain open after sending
    await expect(panel).toBeVisible();
  });

  test('Escape closes chat but launcher still works afterward', async ({ page }) => {
    const { launcher, launcherRoot, panel } = await openChat(page);

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Launcher root should report closed state
    await expect(launcherRoot).toHaveAttribute('data-state', 'closed');

    // Panel may still exist but should not be "open" from the launcher perspective
    await expect(launcher).toBeVisible();

    // Re-open via launcher to ensure it still works
    await launcher.click();
    await expect(launcherRoot).toHaveAttribute('data-state', 'open');
    await expect(panel).toBeVisible();
  });
});
