# Dev Dock Locking E2E Tests

## Overview

These tests verify the dev unlock/locking behavior to ensure:
1. ✅ No more 404 errors when unlocking (correct `/api/auth/dev/unlock` path)
2. ✅ No more JSON parsing errors (handles 204 No Content response)
3. ✅ Session persistence (unlock persists across page reloads during session)
4. ✅ No re-prompting (once unlocked, features work immediately)

## Test File
`tests/dev-dock-locking.spec.ts`

## Running the Tests

### Local Development
```bash
# Make sure backend is running
cd apps/backend
uv run uvicorn app.main:app --reload --port 8000

# In another terminal, start Vite dev server
cd apps/web
pnpm dev

# Run the tests
pnpm run test:dev-dock-locking
```

### Quick Test (auto-start backend)
```bash
cd apps/web
pnpm run test:fast:auto
```

## Test Scenarios

### 1. **Successful Unlock with Session Persistence**
- Opens Dev menu
- Fills email and 8-digit PIN
- Clicks unlock
- Verifies Dev menu shows "(unlocked)" state
- Reloads page
- Verifies unlock persists across reload (sessionStorage)

### 2. **Graceful 404 Handling**
- Simulates unlock endpoint returning 404
- Attempts unlock
- Verifies Dev menu doesn't show unlocked (graceful failure)

### 3. **204 No Content Response**
- Tests that backend 204 No Content response is handled correctly
- No JSON parsing errors
- Unlock succeeds despite no response body

## Implementation Details

### Store: `src/state/dev.ts`
- Uses `sessionStorage` for persistence (key: `dev.unlocked`)
- Calls `/api/auth/dev/unlock` with `/api` prefix
- Does NOT call `.json()` on response (handles 204 correctly)
- Returns boolean success/failure

### Vite Proxy: `vite.config.ts`
- Added `/auth` proxy as safety net
- Ensures stray `/auth` calls reach backend

### Dev Menu: `src/features/dev/DevMenu.tsx`
- Uses `useDev()` hook from state
- Shows "(unlocked)" when unlocked
- Clears PIN input after successful unlock

## Debugging

### Common Issues

**404 Not Found**
- Check that Vite proxy is running (dev server must be started)
- Verify backend is running on port 8000
- Check that path uses `/api` prefix: `/api/auth/dev/unlock`

**JSON Parse Error**
- Backend may return 204 No Content
- Ensure code does NOT call `res.json()` on unlock response
- Check `src/state/dev.ts` uses `res.ok` only

**Session Not Persisting**
- Check sessionStorage in DevTools: key `dev.unlocked` should equal `"1"`
- Ensure Zustand store initializes from sessionStorage
- Verify store is using `(sessionStorage.getItem(KEY) ?? '') === '1'`

### Playwright Debugging
```bash
# Run with headed browser
pnpm run test:dev-dock-locking -- --headed

# Debug mode (pause on failure)
pnpm run test:dev-dock-locking -- --debug

# Generate trace
pnpm run test:dev-dock-locking -- --trace on
```

## CI Integration

These tests run in the E2E workflow:
- `.github/workflows/e2e-dev-unlock.yml` (on every push/PR)
- `.github/workflows/e2e.yml` (on main branch changes)

## Related Files

### Core Implementation
- `apps/web/src/state/dev.ts` - Zustand store with unlock logic
- `apps/web/src/features/dev/DevMenu.tsx` - UI component
- `apps/web/vite.config.ts` - Proxy configuration

### Backend
- `apps/backend/app/routers/auth.py` - `/auth/dev/unlock` endpoint

### Tests
- `apps/web/tests/dev-dock-locking.spec.ts` - E2E tests
- `apps/web/tests/dev-menu.spec.ts` - Unified dev menu tests

## Success Criteria

✅ All tests pass
✅ No 404 errors in console
✅ No "Unexpected end of JSON input" errors
✅ Dev menu shows "(unlocked)" after successful unlock
✅ Unlock persists across page reloads within same session
✅ TypeScript compilation passes with no errors

## Notes

- Uses `sessionStorage` (not `localStorage`) to ensure unlock expires when browser closes
- Backend may return 200 with JSON body OR 204 No Content - both are valid
- Tests stub the unlock endpoint to avoid needing real PIN/credentials
- Session persistence is intentional - no need to unlock multiple times per session
