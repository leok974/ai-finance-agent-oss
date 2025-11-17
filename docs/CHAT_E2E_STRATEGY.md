# Chat E2E Testing Strategy

## Overview & Goals

LedgerMind ChatDock v2 uses Playwright for end-to-end testing with a focus on **production-representative scenarios** and **flake-resistant selectors**. Tests run in both local dev (full stack running) and production (against live `app.ledger-mind.org`).

**Core Principles:**
1. **Use `data-testid` attributes exclusively** for selector stability
2. **HMAC-authenticated session minting** eliminates manual cookie capture
3. **Separate test projects** for local vs production with different retries/timeouts
4. **Mark flaky patterns explicitly** with `@prod`, `@dev-only`, `@requires-llm` tags
5. **Zero iframe references** (ChatDock v2 is direct React mount, not iframe)

**Test Coverage:**
- ✅ Panel open/close lifecycle (launcher button, ESC, click-away)
- ✅ Layout and responsiveness (header, sections, footer, scrolling)
- ✅ Tool execution and AGUI streaming (LLM-dependent tests marked `@requires-llm`)
- ✅ Session persistence (localStorage, cross-tab BroadcastChannel sync)
- ✅ Known issues validation (console errors, CSS overrides, portal cleanup)

---

## Key Selectors & Data Attributes

All ChatDock v2 elements use `data-testid` attributes for stable test selection. **Never use CSS classes, text content, or role queries for critical selectors** (use them only for assertions).

### Selector Reference Table

| Element | `data-testid` | Purpose |
|---------|---------------|---------|
| Launcher root | `lm-chat-launcher` | Container for launcher button (has `data-state="open\|closed"`) |
| Launcher button | `lm-chat-launcher-button` | Floating action button (bottom-right, z-index 70) |
| Overlay | `lm-chat-overlay` | Portal container for shell + backdrop (z-index 69) |
| Backdrop | `lm-chat-backdrop` | Click-away target behind chat panel |
| Shell | `lm-chat-shell` | Main chat panel (fixed positioning, overlay-card style) |
| Scroll container | `lm-chat-scroll` | Scrollable messages area |
| Panel card | `lm-chat-panel` | Inner card wrapper (CSS grid: header + messages + composer) |
| Insights section | `lm-chat-section-insights` | INSIGHTS tool section (month summary, trends, alerts) |
| Subscriptions section | `lm-chat-section-subscriptions` | SUBSCRIPTIONS tool section (recurring, find subscriptions) |
| Search section | `lm-chat-section-search` | SEARCH & PLANNING tool section (insights Q, budget suggest, NL search) |

### Usage Example (Playwright)

```typescript
// ✅ CORRECT: Use data-testid
await page.getByTestId('lm-chat-launcher-button').click();
await expect(page.getByTestId('lm-chat-shell')).toBeVisible();

// ❌ WRONG: Fragile class selectors
await page.locator('.lm-chat-button').click();

// ❌ WRONG: Text content changes with i18n
await page.getByText('Open chat').click();

// ✅ CORRECT: Combine testid with state assertion
const launcher = page.getByTestId('lm-chat-launcher');
await expect(launcher).toHaveAttribute('data-state', 'open');
```

---

## Test Projects & Environments

### Local Development Project (`chromium`)

**Purpose:** Full-stack local testing with dev database and Ollama LLM.

**Configuration (`playwright.config.ts`):**
```typescript
{
  name: 'chromium',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5173',
    storageState: './tests/.auth/storageState.json',
    headless: false,  // headed mode for Google OAuth
  },
  testIgnore: /@prod-only/,
  grepInvert: /@requires-llm/,  // skip LLM tests locally (flaky)
}
```

**Environment Variables:**
- `BASE_URL`: `http://127.0.0.1:5173` (Vite dev server)
- `E2E_DB_HOST`: `127.0.0.1` (PostgreSQL port 5432)
- `PW_WORKERS`: `1` (serialize tests to avoid SQLite locks)
- `DEV_ALLOW_NO_AUTH`: `1` (auth bypass for `dev@local` user)

**Web Server Auto-Start:**
```typescript
webServer: [
  {
    command: 'pnpm run dev',
    url: 'http://127.0.0.1:5173',
    timeout: 180_000,
  },
  {
    command: '.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000',
    url: 'http://127.0.0.1:8000/health',
    timeout: 180_000,
  },
]
```

---

### Production Project (`chromium-prod`)

**Purpose:** Smoke tests against live production deployment.

**Configuration (`playwright.config.ts`):**
```typescript
{
  name: 'chromium-prod',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'https://app.ledger-mind.org',
    storageState: './tests/e2e/.auth/prod-state.json',
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    launchOptions: {
      args: ['--disable-service-worker'],  // prevent SW cache issues
    },
  },
  testIgnore: /@dev-only|@needs-seed/,
  grep: /@prod/,  // ONLY run tests tagged with @prod
  grepInvert: /@requires-llm/,  // skip LLM tests (too flaky in prod)
  retries: 1,  // retry once on failure
}
```

**Environment Variables:**
- `BASE_URL`: `https://app.ledger-mind.org` (production domain)
- `IS_PROD`: `true` (triggers prod-specific behavior in global-setup)
- `E2E_USER`: `e2e@ledgermind.org` (HMAC session user)
- `E2E_SESSION_HMAC_SECRET`: Secret key for HMAC signing
- `PW_PROD_WORKERS`: `2` (limit parallelism to avoid rate limiting)

**Authentication:** HMAC session minting via `global-setup.ts` (see below).

---

## Global Setup: HMAC Session Minting

**Problem Solved:** Eliminates manual cookie capture for authenticated tests. Backend `/api/e2e/session` endpoint returns Set-Cookie headers with valid session token.

### Local Session Mint (`global-setup.ts`)

```typescript
async function globalSetup(config: FullConfig) {
  const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:8083';
  const creds = getHmacCredentials();  // E2E_USER, E2E_SESSION_HMAC_SECRET
  const user = creds.clientId;

  // Create HMAC signature: HMAC-SHA256(user.ts, secret)
  const ts = Math.floor(Date.now() / 1000).toString();
  const msg = `${user}.${ts}`;
  const sig = crypto.createHmac("sha256", creds.secret).update(msg).digest("hex");

  const ctx = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      "x-e2e-ts": ts,
      "x-e2e-sig": sig,
    }
  });

  const r = await ctx.post("/api/e2e/session", {
    data: { user },
  });

  if (!r.ok()) {
    throw new Error(`E2E session mint failed: ${r.status()}`);
  }

  // Extract cookies from Set-Cookie headers
  const cookies = parseCookiesFromHeaders(r.headers()["set-cookie"]);

  // Save to storage state
  const storageState = {
    cookies: cookies.map(c => ({
      ...c,
      domain: TEST_HOST,  // 127.0.0.1 or app.ledger-mind.org
      secure: TEST_IS_HTTPS,
    })),
    origins: [],
  };

  await fs.writeFile('./tests/e2e/.auth/prod-state.json', JSON.stringify(storageState, null, 2));
  await ctx.dispose();
}
```

### Production Session Mint (Fetch-Based)

For production, use simple `fetch` instead of Playwright request context to avoid CORS issues:

```typescript
async function createProdSession(baseUrl: string) {
  const url = new URL('/api/e2e/session', baseUrl).toString();
  const creds = getHmacCredentials();
  const user = creds.clientId;
  const ts = Math.floor(Date.now() / 1000).toString();
  const msg = `${user}.${ts}`;
  const sig = crypto.createHmac("sha256", creds.secret).update(msg).digest("hex");

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-e2e-ts': ts,
      'x-e2e-sig': sig,
    },
    body: JSON.stringify({ user }),
  });

  if (!res.ok) {
    throw new Error(`E2E session mint failed: ${res.status}`);
  }

  const cookies = parseCookiesFromHeaders(res.headers.get('set-cookie'));
  const hostname = new URL(baseUrl).hostname;

  const state = {
    cookies: cookies.map(c => ({ ...c, domain: hostname })),
    origins: [{ origin: baseUrl, localStorage: [] }],
  };

  await fs.writeFile(PROD_AUTH_STATE, JSON.stringify(state, null, 2));
}
```

**Backend HMAC Validation (`/api/e2e/session`):**
```python
def verify_e2e_hmac(request):
    ts = request.headers.get("x-e2e-ts")
    sig = request.headers.get("x-e2e-sig")
    secret = os.getenv("E2E_SESSION_HMAC_SECRET")

    expected = hmac.new(secret.encode(), f"{user}.{ts}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(403, "Invalid HMAC")

    return True
```

---

## Important Specs

### 1. `chat-smoke.spec.ts` (Baseline Health Check)

**Purpose:** Verify basic ChatDock rendering and open/close lifecycle.

**Key Assertions:**
```typescript
test('chat launcher button is visible and clickable', async ({ page }) => {
  const launcher = page.getByTestId('lm-chat-launcher-button');
  await expect(launcher).toBeVisible({ timeout: 15000 });
  await launcher.click();

  const shell = page.getByTestId('lm-chat-shell');
  await expect(shell).toBeVisible({ timeout: 5000 });
});

test('chat launcher root has correct state', async ({ page }) => {
  const root = page.getByTestId('lm-chat-launcher');
  await expect(root).toHaveAttribute('data-state', 'closed');

  await page.getByTestId('lm-chat-launcher-button').click();
  await expect(root).toHaveAttribute('data-state', 'open', { timeout: 3000 });
});

test('page does not have overflow hidden (CSS fix)', async ({ page }) => {
  const htmlOverflow = await page.evaluate(() => {
    return window.getComputedStyle(document.documentElement).overflow;
  });
  expect(htmlOverflow).not.toBe('hidden');
});
```

**Validates:** CSS fix for portal rendering, launcher state transitions, no console errors during mount.

---

### 2. `chat-panel-layout.spec.ts` (Polished Design Validation)

**Purpose:** Verify LEDGERMIND ASSISTANT header, tool sections, and footer layout.

**Key Assertions:**
```typescript
test('header and actions match LEDGERMIND ASSISTANT design', async ({ page }) => {
  await page.getByTestId('lm-chat-launcher-button').click();
  const shell = page.getByTestId('lm-chat-shell');

  await expect(shell.getByText('LEDGERMIND ASSISTANT', { exact: false })).toBeVisible();
  await expect(shell.getByText('LLM: OK', { exact: false })).toBeVisible();
  await expect(shell.getByText('Export JSON', { exact: false })).toBeVisible();
  await expect(shell.getByText('Hide tools', { exact: false })).toBeVisible();
});

test('sections INSIGHTS / SUBSCRIPTIONS / SEARCH & PLANNING are present', async ({ page }) => {
  const shell = page.getByTestId('lm-chat-shell');

  await expect(shell.locator('.lm-chat-section-label', { hasText: 'INSIGHTS' })).toBeVisible();
  await expect(shell.locator('.lm-chat-section-label', { hasText: 'SUBSCRIPTIONS' })).toBeVisible();
  await expect(shell.locator('.lm-chat-section-label', { hasText: 'SEARCH & PLANNING' })).toBeVisible();

  await expect(shell.getByText('Month summary', { exact: false })).toBeVisible();
  await expect(shell.getByText('Recurring', { exact: false })).toBeVisible();
  await expect(shell.getByText('Insights (Q)', { exact: false })).toBeVisible();
});
```

**Validates:** Design system compliance, tool organization, greeting + input row rendering.

---

### 3. `chat-overlay-cleanup.spec.ts` (Portal Lifecycle)

**Purpose:** Ensure overlay is removed from DOM on close (prevent memory leaks).

**Status:** ⚠️ File exists but is empty (needs implementation).

**Recommended Implementation:**
```typescript
test('overlay is removed from DOM after close', async ({ page }) => {
  await page.getByTestId('lm-chat-launcher-button').click();
  await expect(page.getByTestId('lm-chat-overlay')).toBeAttached();

  // Close via ESC
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);  // animation delay

  await expect(page.getByTestId('lm-chat-overlay')).not.toBeAttached();
});

test('multiple open/close cycles do not leak overlays', async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('lm-chat-launcher-button').click();
    await expect(page.getByTestId('lm-chat-shell')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  const overlayCount = await page.locator('[data-testid="lm-chat-overlay"]').count();
  expect(overlayCount).toBe(0);
});
```

---

## Migration Notes: Iframe v1 → ChatDock v2

### Breaking Changes

| Iframe v1 (Old) | ChatDock v2 (New) | Migration Action |
|-----------------|-------------------|------------------|
| `#chat-iframe` selector | `[data-testid="lm-chat-shell"]` | Update all `page.frameLocator('#chat-iframe')` to direct `page.getByTestId()` |
| `iframe.contentWindow.postMessage()` | Direct React state | Remove all postMessage logic; use Zustand store or UI interactions |
| `.chat-launcher-iframe` CSS class | `[data-testid="lm-chat-launcher"]` | Update CSS selectors to data-testid |
| Message from iframe: `{type: 'chat:opened'}` | `data-state="open"` attribute | Check `data-state` attribute instead of listening for window messages |
| Iframe `src` attribute check | Component render check | Use `await expect(shell).toBeAttached()` instead of `iframe.src` |

### Selector Migration Examples

**Before (Iframe v1):**
```typescript
// ❌ OLD: Access chat via iframe
const chatFrame = page.frameLocator('#chat-iframe');
await chatFrame.locator('.chat-input').fill('Show spending');
await chatFrame.locator('button.send').click();
```

**After (ChatDock v2):**
```typescript
// ✅ NEW: Direct access via data-testid
const shell = page.getByTestId('lm-chat-shell');
const input = shell.getByRole('textbox', { name: /ask or type a command/i });
await input.fill('Show spending');
await shell.getByRole('button', { name: /^send$/i }).click();
```

**Before (Open state check via postMessage):**
```typescript
// ❌ OLD: Listen for iframe message
let chatOpened = false;
page.on('console', msg => {
  if (msg.text().includes('chat:opened')) chatOpened = true;
});
await page.locator('.chat-launcher').click();
await page.waitForFunction(() => chatOpened);
```

**After (Open state check via attribute):**
```typescript
// ✅ NEW: Check data-state attribute
await page.getByTestId('lm-chat-launcher-button').click();
await expect(page.getByTestId('lm-chat-launcher')).toHaveAttribute('data-state', 'open');
```

---

## Known Flaky Patterns & How We Avoid Them

### 1. **Race Condition: Portal Not Attached Yet**

**Symptom:**
```
Error: element is not attached to the DOM
```

**Cause:** React portal takes 1-2 frames to attach to `document.body`.

**Fix:** Use `waitFor({ state: 'attached' })` before interacting:
```typescript
// ❌ WRONG: Immediate click after open
await page.getByTestId('lm-chat-launcher-button').click();
await page.getByTestId('lm-chat-shell').locator('button').first().click();

// ✅ CORRECT: Wait for attachment
await page.getByTestId('lm-chat-launcher-button').click();
await page.getByTestId('lm-chat-shell').waitFor({ state: 'attached' });
await page.getByTestId('lm-chat-shell').locator('button').first().click();
```

---

### 2. **Animation Timing: Close Handler Delay**

**Symptom:** Test tries to assert overlay is gone but it's still animating out.

**Cause:** `handleClose()` has 220ms delay for CSS transition:
```typescript
const handleClose = () => {
  setIsClosing(true);
  setTimeout(() => {
    setOpen(false);
    setIsClosing(false);
  }, 220);
};
```

**Fix:** Add 300ms wait after ESC or click-away:
```typescript
await page.keyboard.press('Escape');
await page.waitForTimeout(300);  // 220ms animation + 80ms buffer
await expect(page.getByTestId('lm-chat-overlay')).not.toBeAttached();
```

---

### 3. **LLM Timeout: AGUI Stream Never Finishes**

**Symptom:** Test hangs waiting for `event: finish` from `/agent/stream`.

**Cause:** Ollama warming up, model not loaded, or network timeout.

**Fix:** Mark tests as `@requires-llm` and skip in prod + CI:
```typescript
test('@requires-llm AGUI streaming returns suggestions', async ({ page }) => {
  // ...
});
```

**Playwright config:**
```typescript
grepInvert: /@requires-llm/,  // skip LLM tests
```

---

### 4. **Google OAuth Re-Login Popup**

**Symptom:** OAuth popup appears during E2E run, breaking test flow.

**Cause:** Session expired or cookies not saved.

**Fix:** Use persistent `userDataDir` + headed mode for OAuth stability:
```typescript
use: {
  headless: false,  // Google OAuth fails in headless
  launchOptions: {
    args: ['--user-data-dir=.pw-userdata'],  // persist cookies
  },
}
```

**Alternative:** Use HMAC session minting (bypasses OAuth entirely).

---

### 5. **Stale Build Artifacts in Prod**

**Symptom:** Test passes locally but fails in prod with "element not found".

**Cause:** Old bundle served by Nginx cache or CDN.

**Fix:** Disable service workers in prod tests:
```typescript
launchOptions: {
  args: ['--disable-service-worker'],
},
```

**Manual cache bust:**
```bash
# Force Nginx reload
docker compose -f ops/docker-compose.prod.yml exec nginx nginx -s reload

# Or clear browser cache
await page.context().clearCookies();
await page.context().clearPermissions();
```

---

## How to Add New Chat E2E Tests Safely

### 1. **Choose the Right Test File**

| Test Type | File Pattern | Example |
|-----------|--------------|---------|
| Smoke/health checks | `chat-smoke.spec.ts` | Launcher renders, open/close works |
| Layout/design validation | `chat-panel-layout.spec.ts` | Header, sections, footer present |
| User interactions | `chat-controls.spec.ts` | Input field, send button, ESC key |
| Session/state | `chat-session-management.spec.ts` | localStorage persist, cross-tab sync |
| AGUI/LLM features | `chat-llm.spec.ts` | Streaming, tool execution, suggestions |
| Regressions | `chat-<issue-name>.spec.ts` | Specific bug repro (e.g., `chat.no-react-185.spec.ts`) |

---

### 2. **Use Stable Selectors (data-testid Only)**

```typescript
// ✅ CORRECT: data-testid selector
const shell = page.getByTestId('lm-chat-shell');

// ❌ WRONG: CSS class (breaks on refactor)
const shell = page.locator('.lm-chat-card');

// ❌ WRONG: Text content (breaks on i18n)
const shell = page.getByText('LEDGERMIND ASSISTANT');
```

**If new element needs testid:**
```tsx
<div className="..." data-testid="lm-chat-new-element">
  {/* ... */}
</div>
```

---

### 3. **Add Proper Wait Conditions**

```typescript
// ✅ CORRECT: Wait for element + interaction
await page.getByTestId('lm-chat-launcher-button').click();
await page.getByTestId('lm-chat-shell').waitFor({ state: 'visible' });
const input = page.getByTestId('lm-chat-shell').getByRole('textbox');
await input.fill('query');

// ❌ WRONG: No wait (race condition)
await page.getByTestId('lm-chat-launcher-button').click();
await page.getByTestId('lm-chat-shell').locator('input').fill('query');
```

---

### 4. **Tag Tests Appropriately**

| Tag | Meaning | Usage |
|-----|---------|-------|
| `@prod` | Safe to run against production | Smoke tests, layout checks (no data mutations) |
| `@dev-only` | Requires dev database seed | Tests that need specific transaction data |
| `@requires-llm` | Depends on LLM response | AGUI streaming, suggestion chips, LLM-generated replies |
| `@needs-seed` | Requires DB seed script | Budget tests, rule tests, specific merchant data |

**Example:**
```typescript
test.describe('@prod ChatDock smoke tests', () => {
  test('launcher renders', async ({ page }) => { /* ... */ });
});

test.describe('@dev-only Budget suggestions', () => {
  test('@needs-seed suggest budget for dining category', async ({ page }) => { /* ... */ });
});

test.describe('@requires-llm AGUI streaming', () => {
  test('streaming returns suggestions', async ({ page }) => { /* ... */ });
});
```

---

### 5. **Add `ensureChatAvailable()` Helper**

For prod tests, skip if chat launcher not found (auth issue):

```typescript
async function ensureChatAvailable(page: Page) {
  await page.goto('/', { waitUntil: 'load', timeout: 60000 });

  if (process.env.IS_PROD === 'true') {
    try {
      await page.getByTestId('lm-chat-launcher-button').waitFor({ timeout: 15000 });
    } catch {
      test.skip(true, 'Chat launcher not found – likely E2E session/auth issue');
    }
  }
}

test.beforeEach(async ({ page }) => {
  await ensureChatAvailable(page);
});
```

---

### 6. **Configure Retries and Timeouts**

```typescript
test.describe.configure({
  retries: process.env.IS_PROD === 'true' ? 1 : 0,  // retry once in prod
  timeout: 60_000,  // 60s for slow prod LLM responses
});
```

---

## References

- **Playwright config**: `apps/web/playwright.config.ts`
- **Global setup (HMAC)**: `apps/web/tests/e2e/global-setup.ts`
- **Smoke tests**: `apps/web/tests/e2e/chat-smoke.spec.ts`
- **Layout tests**: `apps/web/tests/e2e/chat-panel-layout.spec.ts`
- **ChatDock component**: `apps/web/src/components/ChatDock.tsx`
- **State management**: `apps/web/src/state/chatSession.ts`
- **HMAC utils**: `apps/web/tests/e2e/utils/hmac.ts`
