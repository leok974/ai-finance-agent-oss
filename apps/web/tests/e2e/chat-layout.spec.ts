// tests/e2e/chat-layout.spec.ts
import { test, expect } from '@playwright/test';

// Use authenticated state from existing setup
test.use({ storageState: 'tests/e2e/.auth/prod-state.json' });

const BASE_URL = process.env.BASE_URL ?? 'https://app.ledger-mind.org';

async function openChat(page) {
  await page.goto(BASE_URL);

  const launcherRoot = page.getByTestId('lm-chat-launcher');
  const launcherButton = page.getByTestId('lm-chat-launcher-button');

  await expect(launcherButton).toBeVisible();
  await expect(launcherRoot).toHaveAttribute('data-state', 'closed');

  await launcherButton.click();
  await expect(launcherRoot).toHaveAttribute('data-state', 'open');

  const panel = page.getByTestId('lm-chat-panel');
  await expect(panel).toBeVisible();

  return { launcherRoot, launcherButton, panel };
}

test.describe('ChatDock layout (v2) @prod', () => {
  test('launcher is anchored to bottom-right quadrant', async ({ page }) => {
    await page.goto(BASE_URL);

    // Check the button, not the root (root is hidden when closed)
    const launcherButton = page.getByTestId('lm-chat-launcher-button');
    await expect(launcherButton).toBeVisible();

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    if (!viewport) return;

    const bounds = await launcherButton.boundingBox();
    expect(bounds).not.toBeNull();
    if (!bounds) return;

    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;

    // Right/bottom edges must be inside viewport
    expect(right).toBeLessThanOrEqual(viewport.width);
    expect(bottom).toBeLessThanOrEqual(viewport.height);

    // Should live in bottom-right quadrant (not left/top side)
    expect(bounds.x).toBeGreaterThanOrEqual(viewport.width * 0.5);
    expect(bounds.y).toBeGreaterThanOrEqual(viewport.height * 0.5);
  });

  test('chat panel fits horizontally within viewport when open', async ({ page }) => {
    const { panel } = await openChat(page);

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    if (!viewport) return;

    const bounds = await panel.boundingBox();
    expect(bounds).not.toBeNull();
    if (!bounds) return;

    const right = bounds.x + bounds.width;

    // Panel must be fully within horizontal bounds
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(viewport.width);

    // And it should not be a tiny sliver
    expect(bounds.width).toBeGreaterThan(280);
  });

  test('launcher and panel remain visible after viewport resize', async ({ page }) => {
    await page.goto(BASE_URL);
    const launcherRoot = page.getByTestId('lm-chat-launcher');
    const launcherButton = page.getByTestId('lm-chat-launcher-button');

    // Initial viewport
    await expect(launcherButton).toBeVisible();

    // Open chat
    await launcherButton.click();
    await expect(launcherRoot).toHaveAttribute('data-state', 'open');
    const panel = page.getByTestId('lm-chat-panel');
    await expect(panel).toBeVisible();

    // Resize to a smaller viewport
    await page.setViewportSize({ width: 900, height: 600 });

    // Both should still be visible post-resize
    await expect(launcherButton).toBeVisible();
    await expect(panel).toBeVisible();

    const viewport = page.viewportSize()!;
    const panelBounds = await panel.boundingBox();
    const launcherBounds = await launcherButton.boundingBox();

    if (panelBounds) {
      const right = panelBounds.x + panelBounds.width;
      expect(panelBounds.x).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(viewport.width);
    }

    if (launcherBounds) {
      const right = launcherBounds.x + launcherBounds.width;
      const bottom = launcherBounds.y + launcherBounds.height;
      expect(right).toBeLessThanOrEqual(viewport.width);
      expect(bottom).toBeLessThanOrEqual(viewport.height);
    }
  });
});
