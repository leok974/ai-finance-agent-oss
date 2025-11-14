# E2E Testing Notes: Chat Iframe

## Chat Bundle Architecture

The chat UI (`?chat=1&panel=0`) runs in a **separate Vite build** from the main app. This means:

- The chat bundle has its own module instances (stores, utilities, etc.) separate from the main app bundle
- Tests against `?chat=1&panel=0` must treat the chat iframe as a standalone page with independent state
- Any shared state between host page and iframe must use `postMessage` communication
- When testing chat-only mode, all state and interactions are contained within the iframe's JavaScript context

## Element Interception Workaround

If Playwright reports that an element is clickable but another element intercepts pointer events (common with overlapping headers or sticky elements), prefer using JavaScript evaluation to trigger the click directly:

```typescript
// ❌ May fail with "element intercepts pointer events"
await toggle.click({ force: true });

// ✅ Bypasses Playwright's actionability checks
await page.evaluate(() => {
  const iframe = document.querySelector<HTMLIFrameElement>('#lm-chat-iframe');
  const btn = iframe?.contentDocument?.querySelector<HTMLButtonElement>('[data-testid="chat-tools-toggle"]');
  btn?.click();
});
```

This approach is particularly useful when:
- The element is genuinely clickable by users in the browser
- Playwright's interception detection is overly conservative
- The element's position or z-index makes Playwright think it's covered

Use this technique sparingly and only when standard `.click()` fails, as it bypasses Playwright's built-in safety checks.
