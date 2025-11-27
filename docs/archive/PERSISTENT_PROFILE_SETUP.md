# Playwright Persistent Profile Setup

## Zero Re-Login with Google OAuth

This approach uses a **persistent Chrome profile** that reuses the same cookies/session across all test runs. You log in **once** manually, and all tests run authenticated forever.

## One-Time Setup

### 1. Open Playwright browser with persistent profile

```powershell
# From repository root
cd apps/web
pnpm exec playwright open --user-data-dir="../../.pw-userdata" https://app.ledger-mind.org
```

This will:
- Launch a headed Chrome browser
- Create persistent profile at `C:\ai-finance-agent-oss-clean\.pw-userdata`
- Navigate to the app

### 2. Log in with Google

In the opened browser window:
1. Click **"Sign in with Google"**
2. Complete OAuth flow (select account, approve permissions)
3. Wait for dashboard to load (confirms you're logged in)
4. **Close the browser window**

That's it! The profile now contains valid session cookies.

### 3. Verify profile is authenticated

```powershell
# Quick test to verify login persists
cd apps/web
$env:BASE_URL='https://app.ledger-mind.org'
pnpm exec playwright test "auth-flow.spec.ts" --project=chromium-persistent
```

**Expected output:**
```
✓ auth flow → /api/auth/me 200
```

## Running Tests

All tests now use the persistent profile automatically:

```powershell
cd apps/web
$env:BASE_URL='https://app.ledger-mind.org'

# Run all chat portal-guard tests
pnpm exec playwright test "chat.*.spec.ts" --project=chromium-persistent --reporter=line

# Run specific test
pnpm exec playwright test "chat.lifecycle.spec.ts" --project=chromium-persistent

# Run all tests (authenticated)
pnpm exec playwright test --project=chromium-persistent
```

## How It Works

### Configuration
```typescript
// playwright.config.ts
const userDataDir = path.join(process.cwd(), '../../.pw-userdata');

projects: [
  {
    name: 'chromium-persistent',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: {
        args: [`--user-data-dir=${userDataDir}`],
      },
    },
  },
]
```

### What Happens
1. Playwright launches Chrome with `--user-data-dir=.pw-userdata`
2. Chrome loads cookies/localStorage from that profile
3. All tests start already logged in
4. Session persists across runs until cookies expire

### Headless Mode
Set `headless: false` globally for Google OAuth stability:
```typescript
use: {
  headless: false,  // Google OAuth works better in headed mode
  // ...
}
```

## Advantages Over storageState

✅ **Zero re-login** - Log in once, works forever
✅ **Google OAuth compatible** - No programmatic login needed
✅ **Simpler setup** - No globalSetup, no credentials in env vars
✅ **Extremely stable** - Matches real browser behavior exactly
✅ **No API dependencies** - Doesn't require `/api/auth/login` endpoint

## Troubleshooting

### Tests fail with 401
Session expired. Re-authenticate:
```powershell
# Delete old profile
Remove-Item -Recurse -Force C:\ai-finance-agent-oss-clean\.pw-userdata

# Re-run one-time setup
cd apps/web
pnpm exec playwright open --user-data-dir="../../.pw-userdata" https://app.ledger-mind.org
# Log in with Google again
```

### Profile gets corrupted
```powershell
# Delete and recreate
Remove-Item -Recurse -Force C:\ai-finance-agent-oss-clean\.pw-userdata

# Re-authenticate
cd apps/web
pnpm exec playwright open --user-data-dir="../../.pw-userdata" https://app.ledger-mind.org
```

### Want to test logged-out state
Use a different project without persistent profile, or temporarily rename the profile directory.

## What This Enables

### ✅ Portal Guard Verification
Run chat tests to verify React #185 is eliminated:
```powershell
$env:BASE_URL='https://app.ledger-mind.org'
pnpm --dir apps/web exec playwright test "chat.*.spec.ts" --project=chromium-persistent
```

**Expected results:**
- ✅ `chat.lifecycle.spec.ts` - Host transitions hidden → ready
- ✅ `chat.iframe-realm.spec.ts` - Containers in same iframe document
- ✅ `chat.no-react-185.spec.ts` - No "Minified React error #185"
- ✅ `chat.sandbox-and-portal.spec.ts` - Sandbox/portal validation passes
- ✅ `chat.blackbox-guard.spec.ts` - Error handling works

**Look for in console:**
- ✅ `[portal-guard] iframe roots ensured`
- ✅ `[portal-guard] ReactDOM.createPortal patched`
- ❌ NO "Minified React error #185"
- ❌ NO "ErrorBoundary caught"

## File Structure

```
ai-finance-agent-oss-clean/
├── .pw-userdata/              # Persistent Chrome profile (gitignored)
│   ├── Default/
│   │   ├── Cookies           # Session cookies (includes Google OAuth)
│   │   ├── Local Storage/
│   │   └── ...
│   └── ...
└── apps/web/
    └── playwright.config.ts   # Configured for persistent profile
```

## Security Notes

⚠️ **DO NOT commit `.pw-userdata/`** - Contains real session cookies
✅ Already added to `.gitignore`
✅ Profile is local to your machine only
✅ Safe for local development and testing

## CI/CD Alternative

For CI environments where manual login isn't possible, use the `chromium-prod` project with `storageState` captured from a previous run. The persistent profile is ideal for **local development**.

## Summary

**Persistent profile** = **zero-friction testing**

1. Log in once manually with Google OAuth
2. All tests run authenticated forever
3. No credentials in env vars
4. No globalSetup complexity
5. Works exactly like real browser

Perfect for verifying the portal guard fix eliminated React #185! 🎉
