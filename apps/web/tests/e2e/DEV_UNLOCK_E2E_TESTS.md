# E2E Tests for PIN-Gated Dev Unlock Flow

## Summary

Added comprehensive E2E test coverage for the PIN-gated developer unlock feature with proper test IDs and test infrastructure.

## Changes Made

### 1. Component Test IDs

#### ChatDock.tsx
- **Added imports**: `useShowDevTools` from `@/state/auth`, `RagToolChips` component
- **Integrated RagToolChips**: Added conditional rendering after agent-tools-panel
  ```tsx
  {showDevTools && (
    <div data-testid="rag-chips" className="px-3 py-2 border-b bg-muted/10">
      <RagToolChips onReply={(msg) => appendAssistant(msg)} />
    </div>
  )}
  ```
- **Location**: Lines ~1762-1766 (after showTools panel, before history panel)

#### AccountMenu.tsx
- **Added testid**: `data-testid="unlock-dev"` on "Unlock Dev Tools" button
- **Location**: DropdownMenuItem that opens DevUnlockModal

#### DevUnlockModal.tsx
- **Added testids**:
  - `data-testid="pin-input"` on PIN input field
  - `data-testid="pin-submit"` on submit button

### 2. E2E Test File

**File**: `apps/web/tests/e2e/dev-unlock.spec.ts`

**Test Cases**:
1. **Main unlock flow**: Login → verify chips hidden → unlock with PIN → verify chips visible
2. **Seed action test**: Full unlock flow → click Seed button → verify success
3. **Invalid PIN rejection**: Enter wrong PIN → verify error → verify chips stay hidden
4. **PIN length validation**: Test submit button disabled for <6 digits, enabled for 6 digits

**Test IDs Used**:
- `unlock-dev` - Unlock button in account menu
- `pin-input` - PIN input field in modal
- `pin-submit` - Submit button in modal
- `rag-chips` - RagToolChips wrapper div

**Environment Variables**:
- `DEV_E2E_EMAIL` - Dev superuser email (default: `dev@example.com`)
- `DEV_E2E_PASSWORD` - Dev superuser password (default: `password123`)
- `DEV_SUPERUSER_PIN` - 6-digit PIN (default: `123456`)

### 3. Global Setup Updates

**File**: `apps/web/tests/e2e/.auth/global-setup.ts`

**Changes**:
- Updated `seedUserIfPossible()` to accept `isDev` parameter
- Seeds dev user with `role: 'dev'` when `isDev=true`
- Added dev superuser seeding after unknowns seeding
- Uses environment variables: `DEV_E2E_EMAIL`, `DEV_E2E_PASSWORD`

**Flow**:
1. Seeds regular E2E user (existing)
2. Seeds unknowns for undo tests (existing)
3. Seeds dev superuser if `DEV_E2E_EMAIL` differs from regular `E2E_EMAIL` (NEW)

### 4. Configuration

**File**: `playwright.config.ts`

**Status**: ✅ Already configured correctly
- `globalSetup` points to `./tests/e2e/.auth/global-setup.ts`
- `baseURL` defaults to `http://127.0.0.1:5173`
- Storage state persisted to `.auth/state.json`

## Running the Tests

### Prerequisites

Set environment variables (in `.env.test` or shell):
```bash
DEV_E2E_EMAIL=dev@example.com
DEV_E2E_PASSWORD=your-dev-password
DEV_SUPERUSER_PIN=123456
DEV_SUPERUSER_EMAIL=dev@example.com  # Backend must match DEV_E2E_EMAIL
APP_ENV=dev                           # Backend must be in dev mode
```

### Run Tests

```bash
# Run all E2E tests
pnpm -C apps/web run test:e2e

# Run only dev-unlock tests
pnpm -C apps/web run test:e2e dev-unlock

# Run with UI
pnpm -C apps/web run test:e2e --ui

# Debug mode
pnpm -C apps/web run test:e2e dev-unlock --debug
```

### Test Flow

1. **Global Setup**:
   - Seeds regular E2E user
   - Seeds dev superuser (if credentials differ)
   - Authenticates and saves storage state

2. **Test Execution**:
   - Each test starts with `beforeEach` login helper
   - Uses saved storage state for faster auth
   - Tests PIN unlock flow with test IDs
   - Verifies RagToolChips visibility before/after unlock

3. **Assertions**:
   - RAG chips hidden before unlock
   - Unlock button visible in account menu
   - PIN modal appears on click
   - Correct PIN unlocks dev tools
   - RAG chips visible after unlock
   - Seed button clickable and functional
   - Invalid PIN shows error and prevents unlock

## Architecture

### Component Hierarchy

```
ChatDock
├── Agent Tools Panel (showTools conditional)
├── RagToolChips (showDevTools conditional) ← NEW with data-testid="rag-chips"
└── History Panel

AccountMenu (dropdown)
├── Email item
├── Change Password item
├── Unlock Dev Tools item ← data-testid="unlock-dev"
└── Logout item

DevUnlockModal
├── PIN input ← data-testid="pin-input"
└── Submit button ← data-testid="pin-submit"
```

### Test ID Strategy

- **Semantic naming**: Use descriptive IDs like `unlock-dev`, `pin-input`
- **Stable selectors**: Test IDs never change, unlike classes or text
- **Component-scoped**: Use `page.locator('[data-testid="x"]')` for direct access
- **Nested contexts**: Use `ragChips.locator('button:has-text("Seed")')` for sub-elements

### State Management

```
Login (DEV_E2E_EMAIL)
  → user.env='dev' && user.email === DEV_SUPERUSER_EMAIL
  → user.dev_unlocked = false (initial)
  → Click unlock button
  → Enter PIN
  → POST /auth/dev/unlock
  → request.state.dev_unlocked = True
  → user.dev_unlocked = true (after refresh)
  → useShowDevTools() returns true
  → RagToolChips renders
```

## Troubleshooting

### Test fails: "unlock-dev not visible"
- Verify `DEV_E2E_EMAIL` matches `DEV_SUPERUSER_EMAIL` in backend
- Check `APP_ENV=dev` is set for backend
- Ensure user is logged in before checking

### Test fails: "Invalid PIN"
- Verify `DEV_SUPERUSER_PIN` matches backend setting
- Check backend logs for PIN verification errors
- Ensure PIN is exactly 6 digits

### Test fails: "rag-chips not visible after unlock"
- Check network tab for `/auth/dev/unlock` 200 response
- Verify user refresh happened after unlock
- Check console for useShowDevTools() return value
- Ensure RagToolChips integrated into ChatDock correctly

### Global setup fails
- Verify backend is running on port 8989
- Check `/dev/env` endpoint returns `allow_dev_routes: true`
- Ensure `ALLOW_DEV_ROUTES=1` set for backend

## Future Enhancements

1. **Snapshot testing**: Capture PIN modal appearance
2. **Network mocking**: Test unlock with mocked responses
3. **Parallel testing**: Multiple dev users with different PINs
4. **Accessibility tests**: Keyboard navigation, screen reader support
5. **Performance tests**: Measure unlock latency
6. **Visual regression**: Compare screenshots before/after unlock

## Files Modified

```
apps/web/
├── src/
│   └── components/
│       ├── ChatDock.tsx          # Integrated RagToolChips with testid
│       ├── AccountMenu.tsx        # Added testid to unlock button
│       └── DevUnlockModal.tsx     # Added testids to PIN input/submit
└── tests/
    └── e2e/
        ├── dev-unlock.spec.ts     # NEW: E2E test suite
        └── .auth/
            └── global-setup.ts    # Updated: Seed dev user
```

## Related Documentation

- [DEV_PIN_GATED_UNLOCK.md](../../../docs/DEV_PIN_GATED_UNLOCK.md) - Complete PIN-gated unlock guide
- [Playwright Documentation](https://playwright.dev/) - E2E testing framework
- [Copilot Instructions](../.github/copilot-instructions.md) - Project coding standards
