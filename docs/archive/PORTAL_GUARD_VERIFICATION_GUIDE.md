# Complete Portal Guard + Auth Setup - Quick Reference

## Status: Ready to Test ✅

Everything is implemented and pushed to `fix/chat-iframe-csp` (29 commits total).

## What Was Built

### 1. Portal Guard System (Commit 8e68275a)
**Eliminates React #185 by preventing cross-document portal attempts**

**Implementation:**
- `ensureIframeRoots()` - Creates portal containers before React renders
- `ReactDOM.createPortal` monkey-patch - Validates/reroutes bad containers
- Simplified UI components - Removed iframe detection logic

**Files Modified:**
- `apps/web/src/chat/main.tsx` - Portal guards + monkey-patch
- `apps/web/src/components/ui/tooltip.tsx` - Simplified
- `apps/web/src/components/ui/dropdown-menu.tsx` - Simplified
- `apps/web/src/components/ui/popover.tsx` - Simplified

**How It Works:**
```typescript
// 1. Create safe portal containers in iframe BEFORE React renders
ensureIframeRoots();  // Creates #__LM_PORTAL_ROOT__, #sonner-toaster, #radix-portal-root

// 2. Monkey-patch ReactDOM.createPortal to catch bad containers
(ReactDOM as any).createPortal = (children, container, ...rest) => {
  // Validate: container instanceof Element && container.ownerDocument === document
  if (!valid) {
    console.warn('[portal-guard] bad container; rerouting to __LM_PORTAL_ROOT__');
    container = rootGetter();  // Fallback to iframe's portal root
  }
  return orig(children, container, ...rest);
};
```

### 2. E2E Test Suite (Commit 079ccc14)
**5 comprehensive specs to prevent regressions**

- `chat.lifecycle.spec.ts` - Host state transitions (hidden → ready)
- `chat.iframe-realm.spec.ts` - Containers in same iframe document
- `chat.no-react-185.spec.ts` - No React #185 errors
- `chat.sandbox-and-portal.spec.ts` - Sandbox/portal validation
- `chat.blackbox-guard.spec.ts` - Error handling

### 3. Persistent Profile Auth (Commit ddc43cf0) ⭐ **RECOMMENDED**
**Zero re-login with Google OAuth**

**Setup:**
```powershell
# 1. One-time: Open browser and log in
cd apps/web
pnpm exec playwright open --user-data-dir="../../.pw-userdata" https://app.ledger-mind.org
# Click "Sign in with Google", complete OAuth, close browser

# 2. All tests now run authenticated
$env:BASE_URL='https://app.ledger-mind.org'
pnpm exec playwright test "chat.*.spec.ts" --project=chromium-persistent
```

**Why Persistent Profile?**
- ✅ Log in once, works forever (until cookies expire)
- ✅ Google OAuth compatible (no programmatic login needed)
- ✅ Simplest setup (no env vars, no globalSetup)
- ✅ Extremely stable (real browser behavior)

### 4. Alternative: Global Setup Auth (Commit d9d39641)
**For environments needing programmatic login**

**Setup:**
```powershell
$env:PW_EMAIL="user@example.com"
$env:PW_PASSWORD="password"
$env:BASE_URL="https://app.ledger-mind.org"
cd apps/web
pnpm exec playwright test --list  # Triggers auth setup
```

**When to Use:**
- Need programmatic login (API or UI automation)
- Can't do manual OAuth flow
- CI/CD with credentials in secrets

## How to Verify Portal Guards Work

### Step 1: Authenticate (Choose One)

**Option A: Persistent Profile** (Recommended)
```powershell
cd apps/web
pnpm exec playwright open --user-data-dir="../../.pw-userdata" https://app.ledger-mind.org
# Sign in with Google, close browser
```

**Option B: Global Setup**
```powershell
$env:PW_EMAIL="your@email.com"
$env:PW_PASSWORD="password"
cd apps/web
pnpm exec playwright test --list
```

### Step 2: Run Chat Tests

```powershell
cd apps/web
$env:BASE_URL='https://app.ledger-mind.org'

# Option A users:
pnpm exec playwright test "chat.*.spec.ts" --project=chromium-persistent --reporter=line

# Option B users:
pnpm exec playwright test "chat.*.spec.ts" --reporter=line
```

### Step 3: Verify Results

**Expected if portal guards work:**
```
✓ chat.lifecycle.spec.ts
  ✓ Host starts opacity:0, flips to ready

✓ chat.iframe-realm.spec.ts
  ✓ #chat-root and #__LM_PORTAL_ROOT__ in same iframe document

✓ chat.no-react-185.spec.ts
  ✓ No React #185 during mount

✓ chat.sandbox-and-portal.spec.ts
  ✓ Sandbox flags + portal ownership valid

✓ chat.blackbox-guard.spec.ts
  ✓ Error handling keeps host hidden
```

**Look for in console output:**
- ✅ `[portal-guard] iframe roots ensured, portal=`
- ✅ `[portal-guard] ReactDOM.createPortal patched`
- ✅ `[portal-guard] created __LM_PORTAL_ROOT__ in iframe document`

**Should NOT see:**
- ❌ `Minified React error #185`
- ❌ `ErrorBoundary caught`
- ❌ Any portal-guard warnings about rerouted containers

### Step 4: Manual Verification

Visit the app with chat enabled:
```
https://app.ledger-mind.org/?chat=1
```

**Test interactions:**
1. Chat iframe loads and becomes visible
2. Hover over tooltips (should work without errors)
3. Open dropdowns (should work without errors)
4. Open console - no React #185 errors

## File Reference

### Portal Guards
- `apps/web/src/chat/main.tsx` - Portal guard implementation

### Tests
- `apps/web/tests/e2e/chat.lifecycle.spec.ts`
- `apps/web/tests/e2e/chat.iframe-realm.spec.ts`
- `apps/web/tests/e2e/chat.no-react-185.spec.ts`
- `apps/web/tests/e2e/chat.sandbox-and-portal.spec.ts`
- `apps/web/tests/e2e/chat.blackbox-guard.spec.ts`

### Auth (Persistent Profile)
- `apps/web/playwright.config.ts` - Configured for persistent profile
- `.gitignore` - Excludes `.pw-userdata/`
- `PERSISTENT_PROFILE_SETUP.md` - Complete guide

### Auth (Global Setup Alternative)
- `apps/web/tests/setup/global-setup.ts` - Auth state manager
- `apps/web/tests/setup/global-teardown.ts` - No-op keeper
- `apps/web/tests/utils/auth.ts` - Helper utilities
- `apps/web/tests/.auth/README.md` - Complete guide
- `apps/web/tests/.auth/setup-auth.ps1` - Helper script
- `AUTH_SETUP_COMPLETE.md` - Reference guide

## Branch Status

**Branch:** `fix/chat-iframe-csp`
**Commits:** 29
**Latest:** `ddc43cf0` - Persistent profile setup
**Status:** ✅ Ready for testing

## Troubleshooting

### Auth Issues (Persistent Profile)
```powershell
# Delete and recreate profile
Remove-Item -Recurse -Force C:\ai-finance-agent-oss-clean\.pw-userdata
cd apps/web
pnpm exec playwright open --user-data-dir="../../.pw-userdata" https://app.ledger-mind.org
```

### Auth Issues (Global Setup)
```powershell
# Refresh auth state
Remove-Item apps/web/tests/.auth/storageState.json -ErrorAction Ignore
cd apps/web
pnpm exec playwright test --list
```

### Portal Guards Not Visible in Bundle
```powershell
# Rebuild web app
cd apps/web
pnpm run build

# Verify portal-guard code present
Select-String -Path "dist/assets/chat-*.js" -Pattern "portal-guard"
```

### Docker Deployment
```powershell
# Rebuild nginx with latest bundle
cd C:\ai-finance-agent-oss-clean
docker compose -f ops/docker-compose.prod.yml build --no-cache nginx
docker compose -f ops/docker-compose.prod.yml up -d nginx

# Verify bundle served
curl https://app.ledger-mind.org/chat/index.html
```

## Summary

**Portal Guards:** ✅ Implemented and pushed
**E2E Tests:** ✅ Created (5 comprehensive specs)
**Auth System:** ✅ Two options available (persistent profile recommended)
**Documentation:** ✅ Complete setup guides provided
**Status:** 🚀 Ready to verify React #185 is eliminated

**Next Step:** Authenticate with persistent profile and run chat tests to confirm portal guards work!
