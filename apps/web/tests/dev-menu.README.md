# Dev Menu E2E Test

## Purpose

This test verifies the unified dev menu consolidation is working correctly:

1. **Single Dev Button** - Only one "Dev" button renders in the header
2. **PIN Unlock Flow** - 8-digit PIN unlocking works (stubbed backend)
3. **API Routing** - `/api/agent/models` routing works (no 404s from Vite)
4. **Dev Actions** - All dev menu items are accessible after unlock

## Running the Test

### Quick Run (with live dev server)

If you already have the Vite dev server running on port 5173:

```powershell
# Skip web server startup, use existing dev server
pnpm run test:dev-menu
```

### Full Run (starts servers automatically)

If servers are not running:

```powershell
# Playwright will start both frontend and backend
pnpm run test:pw tests/dev-menu.spec.ts
```

### UI Mode (debug and watch)

```powershell
# Interactive test runner
pnpm run test:pw:ui tests/dev-menu.spec.ts
```

## Environment Variables

- **E2E_DEV_PIN**: Custom PIN for testing (default: `12345678`)
- **BASE_URL**: Frontend URL (default: `http://127.0.0.1:5173`)
- **PW_SKIP_WS**: Skip web server startup (use `1` if servers already running)

Example:

```powershell
$env:E2E_DEV_PIN="87654321"
pnpm run test:dev-menu
```

## What the Test Verifies

### ✅ Single Dev Button

Ensures exactly one `Dev` button is rendered using `data-testid="dev-trigger"`:

```typescript
const devBtn = page.getByTestId('dev-trigger');
await expect(devBtn).toHaveCount(1);
```

### ✅ PIN Unlock

Tests the 8-digit PIN unlock flow:

1. Click Dev button
2. Fill PIN input (`data-testid="dev-pin"`)
3. Click Unlock button (`data-testid="dev-unlock"`)
4. Verify button text changes to "Dev (unlocked)"

The backend unlock endpoint is **stubbed** to always return success:

```typescript
await page.route('**/api/auth/dev/unlock', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true }),
  });
});
```

### ✅ API Routing (No 404s)

Verifies that clicking "Refresh Models" makes the correct API call:

- **Good**: `http://127.0.0.1:5173/api/agent/models` → Vite proxy → backend
- **Bad**: `http://127.0.0.1:5173/agent/models` → 404 from Vite

The test:
1. Stubs `/api/agent/models` to track if it's called
2. Guards against `/agent/models` (without `/api`)
3. Clicks "Refresh Models"
4. Asserts the correct route was called and no bad routes were hit

```typescript
// Good route
await page.route('**/api/agent/models**', async (route) => {
  modelsRequestSeen = true;
  await route.fulfill({ status: 200, body: JSON.stringify({ models: [] }) });
});

// Guard against bad routes
page.on('request', (req) => {
  const url = req.url();
  if (/\/agent\/models(\?|$)/.test(url) && !/\/api\/agent\/models/.test(url)) {
    badAgentRequests.push(url);
  }
});
```

### ✅ Dev Actions Visible

After unlock, verifies all dev menu items are present:

- Open Planner Panel (`data-testid="dev-planner"`)
- Refresh Models (`data-testid="dev-refresh-models"`)
- Seed Demo Data (role-based selector)
- Clear DB (role-based selector)
- Admin Rules toggle (if admin)
- Admin Knowledge toggle (if admin)
- Dev Dock toggle

## Test Selectors

The test uses `data-testid` attributes for stability:

| Element | Selector | Purpose |
|---------|----------|---------|
| Dev button | `dev-trigger` | Main menu trigger |
| PIN input | `dev-pin` | 8-digit PIN field |
| Unlock button | `dev-unlock` | Submit PIN |
| Planner action | `dev-planner` | Open Planner Panel |
| Refresh action | `dev-refresh-models` | Refresh LLM Models |

Other items use role-based selectors (`getByRole('menuitem', ...)`).

## Troubleshooting

### Test fails: "expected 2, got 1" for Dev button

**Issue**: Old `DevBadge` component is still rendering

**Fix**: Verify `App.tsx` only renders one `<DevMenu />` and removed `<DevBadge />`

### Test fails: "Bad agent requests found"

**Issue**: Some code is calling `/agent/models` without `/api` prefix

**Fix**: Find the offending code and ensure it uses `http()` helper from `lib/http.ts`

### Test fails: Route not intercepted

**Issue**: Playwright routes must be set up before navigation

**Fix**: Ensure all `page.route()` calls happen **before** `page.goto('/')`

### Test timeout on PIN unlock

**Issue**: Unlock button not clickable (still disabled)

**Fix**: Verify PIN input has exactly 8 characters and unlock button is enabled

## Integration with CI

This test runs in CI as part of the Playwright suite:

```yaml
# .github/workflows/test.yml
- name: Run E2E tests
  run: pnpm run test:pw
```

It uses the existing Playwright config which:
- Starts Vite dev server on port 5173
- Starts FastAPI backend on port 8000
- Runs tests in chromium

## Related Files

- **Component**: `apps/web/src/features/dev/DevMenu.tsx`
- **Store**: `apps/web/src/state/dev.ts`
- **HTTP Helper**: `apps/web/src/lib/http.ts`
- **Vite Config**: `apps/web/vite.config.ts`
- **Playwright Config**: `apps/web/playwright.config.ts`

## Success Criteria

All assertions pass:

```
✓ Unified Dev menu + /api routing
  ✓ exactly one Dev button, unlock flow, and /api agent/models call (no 404) (5s)
```

No bad agent requests logged, and models API called successfully.
