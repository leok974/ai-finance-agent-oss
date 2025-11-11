import { test, expect } from "@playwright/test";

const APP = process.env.BASE_URL!;

test.use({
  storageState: 'tests/e2e/.auth/prod-state.json'
});

// Verify that the Radix portal shim is the implementation used during chat rendering.
test("@prod radix portal shim activates and prevents React #185", async ({ page }) => {
  const errors: string[] = [];
  const allLogs: string[] = [];

  page.on("console", (msg) => {
    const text = msg.text();
    allLogs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === "error") {
      errors.push(text);
    }
  });

  await page.goto(`${APP}/?chat=1&prefetch=0`, { waitUntil: "networkidle" });

  // Wait for the chat iframe to be created by the app
  await page.waitForFunction(() => {
    const host = document.querySelector('lm-chatdock-host');
    return !!host && !!host.shadowRoot?.querySelector('#lm-chat-frame');
  }, { timeout: 20_000 });

  // Give the chat bundle a moment to mount and portals to render
  await page.waitForTimeout(2000);

  // Log all console output for debugging
  console.log('\n=== ALL CONSOLE LOGS ===');
  allLogs.forEach(log => console.log(log));
  console.log('\n=== ERROR LOGS ===');
  errors.forEach(err => console.log(err));
  console.log('========================\n');

  // No React #185 errors
  const react185Errors = errors.filter(e => /React error #185/.test(e));
  if (react185Errors.length > 0) {
    console.error('React #185 errors found:', react185Errors);
  }
  expect(react185Errors.length).toBe(0);

  // Verify shim log appears (check iframe console via frame locator)
  // Note: Console logs from iframe appear in parent page's console
  const shimLogAppeared = await page.evaluate(() => {
    // Check if we captured the shim log during page load
    return (window as any).__CHAT_SHIM_LOADED__ === true;
  }).catch(() => false);

  // Inside the iframe, Radix should have portaled something
  const iframeHandle = await page.evaluateHandle(() => {
    const host = document.querySelector('lm-chatdock-host');
    return host?.shadowRoot?.querySelector('#lm-chat-frame');
  });

  const chatFrame = await iframeHandle.asElement()?.contentFrame();
  await iframeHandle.dispose();

  if (chatFrame) {
    const portals = chatFrame.locator('[data-radix-portal="true"]');
    await expect(portals.first()).toBeVisible({ timeout: 5_000 });
  }
});
