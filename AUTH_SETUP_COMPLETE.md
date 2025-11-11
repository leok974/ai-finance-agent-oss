# Auth Setup Quick Reference

## What Was Built

A **reusable Playwright auth state system** that eliminates 401 errors and makes tests run faster by logging in once and reusing session cookies.

## Files Created

```
apps/web/tests/
├── .auth/
│   ├── .gitignore           # Prevents committing sensitive storageState.json
│   ├── README.md            # Complete documentation
│   └── setup-auth.ps1       # Helper script for easy setup
├── setup/
│   ├── global-setup.ts      # Runs before all tests, creates auth state
│   └── global-teardown.ts   # No-op, keeps state across runs
└── utils/
    └── auth.ts              # expectLoggedIn() helper
```

**Updated**: `playwright.config.ts` with globalSetup/Teardown hooks

## How It Works

### 1. Global Setup (Automatic)
- Runs **before any tests** execute
- Checks if existing `storageState.json` is still valid
- If invalid/missing, logs in via:
  1. **API route** (`/api/auth/login`) - fast, headless
  2. **UI login** (fallback) - uses real browser
- Saves cookies/localStorage to `tests/.auth/storageState.json`

### 2. Test Execution
- All tests automatically load the saved `storageState.json`
- Every test starts **already logged in**
- No per-test auth setup needed
- Tests run **faster and more reliably**

## Usage

### One-Time Setup

```powershell
# Set credentials
$env:PW_EMAIL="your-test-user@example.com"
$env:PW_PASSWORD="your-password"
$env:BASE_URL="https://app.ledger-mind.org"

# Create auth state (triggers global setup)
cd apps/web
pnpm exec playwright test --list
```

**Output:**
```
[global-setup] Auth state invalid or missing, logging in...
[global-setup] API login successful, state saved to tests/.auth/storageState.json
[global-setup] Auth state verified and ready
```

### Run Tests (Now Authenticated)

```powershell
# Run all chat portal-guard tests
$env:BASE_URL='https://app.ledger-mind.org'
pnpm --dir apps/web exec playwright test "chat.*.spec.ts" --reporter=line --workers=6
```

**Expected Results** (with portal guards working):
- ✅ `chat.lifecycle.spec.ts` - Host flips to ready, no React #185
- ✅ `chat.iframe-realm.spec.ts` - Containers in same iframe document
- ✅ `chat.no-react-185.spec.ts` - No Minified React error #185
- ✅ `chat.sandbox-and-portal.spec.ts` - Sandbox flags correct
- ✅ `chat.blackbox-guard.spec.ts` - Error handling works

### Alternative: Use Helper Script

```powershell
.\apps\web\tests\.auth\setup-auth.ps1 `
  -Email "your@email.com" `
  -Password "your-password" `
  -BaseUrl "https://app.ledger-mind.org"
```

## Refresh Auth State

If cookies expire or you get 401s again:

```powershell
# Delete stale state
Remove-Item apps/web/tests/.auth/storageState.json -ErrorAction Ignore

# Regenerate
cd apps/web
pnpm exec playwright test --list
```

## Verify Portal Guards

Once auth is working, check for portal guard logs:

```powershell
$env:BASE_URL='https://app.ledger-mind.org'
pnpm --dir apps/web exec playwright test "chat.lifecycle.spec.ts" --reporter=line
```

**Look for in console output:**
- `[portal-guard] iframe roots ensured, portal=`
- `[portal-guard] ReactDOM.createPortal patched`
- `[portal-guard] created __LM_PORTAL_ROOT__ in iframe document`

**Should NOT see:**
- ❌ `Minified React error #185`
- ❌ `ErrorBoundary caught`
- ❌ Any cross-document portal warnings

## Troubleshooting

### Auth state not created
Check credentials:
```powershell
echo $env:PW_EMAIL
echo $env:PW_PASSWORD
```

### Login fails
Verify login endpoint works manually:
```powershell
curl -X POST https://app.ledger-mind.org/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"your@email.com","password":"your-password"}'
```

### UI login selector errors
If login form changed, update selectors in `tests/setup/global-setup.ts`:
```typescript
await page.fill('input[name="email"]', EMAIL);        // ← adjust
await page.fill('input[name="password"]', PASSWORD);  // ← adjust
await page.click('button[type="submit"]');            // ← adjust
```

## What This Unblocks

### ✅ Portal Guard Verification
- Can now verify React #185 is eliminated
- Can test chat iframe lifecycle (hidden → ready)
- Can validate portal containers are in correct document

### ✅ Faster Test Runs
- No login delay per test
- State reused across runs
- Only refreshes when expired

### ✅ CI/CD Ready
Set secrets in GitHub Actions:
```yaml
env:
  PW_EMAIL: ${{ secrets.PW_EMAIL }}
  PW_PASSWORD: ${{ secrets.PW_PASSWORD }}
  BASE_URL: https://app.ledger-mind.org
```

## Next Steps

1. **Set credentials** (one-time)
2. **Run `playwright test --list`** to create state
3. **Run chat tests** to verify portal guards work
4. **Check console** for portal-guard logs
5. **Verify no React #185** errors

## Summary

This auth system eliminates the **#1 blocker** preventing verification of the portal guard fix. With saved auth state:

- ✅ Tests run authenticated
- ✅ No more 401 errors
- ✅ Can verify React #185 is gone
- ✅ Can test chat iframe interactions
- ✅ Fast, reusable, CI-ready

**Commit**: `d9d39641` on `fix/chat-iframe-csp`
**Total commits on branch**: 28
