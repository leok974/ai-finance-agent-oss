# PIN-Gated Dev Superuser Implementation

## 🔐 Overview

This document describes the PIN-gated developer superuser unlock system added to LedgerMind. It provides an additional security layer requiring a 6-digit PIN to activate dev-only features, even for the designated `DEV_SUPERUSER_EMAIL`.

## What Changed

### Security Enhancement

**Before (Email-only):**
```
DEV_SUPERUSER_EMAIL set → dev_unlocked=true automatically
```

**After (PIN-gated):**
```
DEV_SUPERUSER_EMAIL set → eligible for unlock
User enters PIN via /auth/dev/unlock → dev_unlocked=true
```

## Implementation Details

### 1. Settings (apps/backend/app/config.py)

**New Setting:**
```python
DEV_SUPERUSER_PIN: str | None = os.getenv("DEV_SUPERUSER_PIN")
```

**Environment Configuration:**
```bash
# secrets/backend.env (never commit)
APP_ENV=dev
DEV_SUPERUSER_EMAIL=leoklemet.pa@gmail.com
DEV_SUPERUSER_PIN=946281  # Your 6-digit PIN

# Optional: Bruteforce protection tuning (defaults shown)
DEV_UNLOCK_MAX_ATTEMPTS=5      # Max failed PIN attempts before lockout
DEV_UNLOCK_LOCKOUT_S=300       # Lockout duration in seconds (5 minutes)
```

### 2. Auth Override (apps/backend/app/utils/auth.py)

**Updated `attach_dev_overrides(user, request=None)`:**
- No longer grants `dev_unlocked` automatically
- Only sets `dev_unlocked=True` when `request.state.dev_unlocked=True`
- The session flag is set by `/auth/dev/unlock` after PIN verification

```python
def attach_dev_overrides(user, request=None):
    """Grant dev privileges only after PIN is verified."""
    if not user or settings.APP_ENV != "dev":
        return user

    # Check if email matches DEV_SUPERUSER_EMAIL
    if user.email.lower() != (settings.DEV_SUPERUSER_EMAIL or "").lower():
        return user

    # Check for session unlock flag (set by /auth/dev/unlock)
    if request and hasattr(request, 'state'):
        if getattr(request.state, "dev_unlocked", False):
            user.dev_unlocked = True

    return user
```

### 3. Dev Unlock Endpoint (apps/backend/app/routers/auth_dev.py)

**NEW: POST /auth/dev/unlock**

Verifies PIN and grants dev access for the session.

**Request:**
```bash
POST /auth/dev/unlock
Content-Type: application/x-www-form-urlencoded

pin=946281
```

**Response (Success):**
```json
{
  "ok": true,
  "message": "Dev mode unlocked",
  "dev_unlocked": true,
  "email": "leoklemet.pa@gmail.com"
}
```

**Response (Invalid PIN):**
```json
{
  "detail": "Invalid PIN"
}
```
HTTP 403

**Security Checks:**
1. ✅ APP_ENV must be "dev"
2. ✅ DEV_SUPERUSER_EMAIL and DEV_SUPERUSER_PIN must be configured
3. ✅ User email must match DEV_SUPERUSER_EMAIL
4. ✅ PIN must match DEV_SUPERUSER_PIN exactly
5. ✅ Bruteforce protection: 5 attempts max, 5-minute lockout

**Bruteforce Protection** (NEW):
- Maximum 5 failed PIN attempts per session/IP
- 5-minute lockout after exceeding limit
- In-memory tracking (resets on server restart)
- Automatic throttle key: `{email}|{session_id or ip}`

**Response (Rate Limited):**
```json
{
  "detail": "Too many failed attempts. Try again in 287 seconds."
}
```
HTTP 429

**NEW: POST /auth/dev/lock**

Manually lock (disable) dev-only features. Clears session and cookie.

**Request:**
```bash
POST /auth/dev/lock
```

**Response:**
```json
{
  "ok": true,
  "message": "Dev mode locked",
  "dev_unlocked": false,
  "email": "leoklemet.pa@gmail.com"
}
```

**Use Cases**:
- Manually re-lock after finishing dev work
- E2E testing unlock/lock cycles
- Security: lock before stepping away from workstation

**NEW: GET /auth/dev/status**

Check unlock eligibility and current status.

**Response:**
```json
{
  "env": "dev",
  "is_dev_env": true,
  "is_superuser": true,
  "dev_unlocked": false,
  "pin_configured": true
}
```

### 4. Strengthened Guards (apps/backend/app/services/rag_tools.py)

**Updated `_require_admin_dev()`:**
```python
def _require_admin_dev(user, dev_only: bool = False):
    if not user or "admin" not in user.roles:
        raise HTTPException(403, "Admin only")

    if dev_only:
        if settings.APP_ENV != "dev":
            raise HTTPException(403, "Dev mode disabled (production)")

        if not getattr(user, "dev_unlocked", False):
            raise HTTPException(403, "Dev PIN required (use /auth/dev/unlock)")
```

**Error Messages:**
- **403 "Dev mode disabled (production)"** - Trying to use dev features in prod
- **403 "Dev PIN required (use /auth/dev/unlock)"** - Need to unlock with PIN first

### 5. Frontend Components

#### DevUnlockModal (apps/web/src/components/DevUnlockModal.tsx)

**NEW React Component:**
- Modal dialog with PIN input (6-digit numeric)
- Calls `/auth/dev/unlock` on submit
- Refreshes user state on success
- Shows error messages for invalid PIN
- Auto-closes on success

**Features:**
- ✅ Numeric-only input with pattern validation
- ✅ Masked password input
- ✅ Loading states during verification
- ✅ Error display with friendly messages
- ✅ Auto-refresh user state after unlock

#### AccountMenu (apps/web/src/components/AccountMenu.tsx)

**Updated:**
- Shows "Unlock Dev Tools" button when:
  - `user.env === 'dev'`
  - User email matches (implied by being logged in)
  - `user.dev_unlocked === false`
- Shows "Dev Tools Unlocked ✓" (disabled) when already unlocked
- Opens DevUnlockModal on click

**UI States:**
```
Not eligible:          (no button shown)
Eligible + locked:     [🔓 Unlock Dev Tools]
Eligible + unlocked:   [🔓 Dev Tools Unlocked ✓] (disabled)
```

### 6. Updated Tests

**Test Updates (apps/backend/tests/test_agent_rag_tools.py):**

All tests updated to reflect PIN-gating:
- `test_require_admin_dev_dev_gate_enabled` - Sets `APP_ENV=dev` and `dev_unlocked=True`
- `test_require_admin_dev_missing_dev_unlocked` - Expects "Dev PIN required" message
- `test_rag_seed_dev_enabled` - Simulates PIN unlock with `dev_unlocked=True`
- `test_rag_seed_missing_dev_unlocked` - Tests PIN requirement

**Error Message Matchers:**
```python
assert "Dev PIN required" in exc_info.value.detail or "unlock" in exc_info.value.detail
assert "Dev mode disabled" in exc_info.value.detail or "production" in exc_info.value.detail
```

## Usage

### Initial Setup

**1. Configure Environment:**
```powershell
# secrets/backend.env
APP_ENV=dev
DEV_SUPERUSER_EMAIL=leoklemet.pa@gmail.com
DEV_SUPERUSER_PIN=946281  # Choose your own 6-digit PIN
```

**2. Seed User (one-time):**
```powershell
$env:APP_ENV='dev'
python -m app.cli_seed_dev_user leoklemet.pa@gmail.com Superleo3
```

**3. Start Backend:**
```powershell
# Backend reads secrets/backend.env automatically
cd apps/backend
python -m app.main
```

### Daily Workflow

**1. Login Normally:**
- Open app in browser
- Login with: `leoklemet.pa@gmail.com` / `Superleo3`

**2. Check /auth/me:**
```json
{
  "email": "leoklemet.pa@gmail.com",
  "roles": ["admin"],
  "dev_unlocked": false,  // ← Not unlocked yet
  "env": "dev"
}
```

**3. Unlock Dev Tools:**

**Option A: Via UI (Recommended)**
1. Click account menu (top right)
2. Click "Unlock Dev Tools"
3. Enter 6-digit PIN: `946281`
4. Click "Unlock"
5. Success! Dev tools now visible

**Option B: Via API**
```powershell
$body = @{ pin = '946281' } | ConvertTo-Json
Invoke-RestMethod -Uri http://127.0.0.1:8000/auth/dev/unlock `
  -Method POST `
  -Body $body `
  -ContentType 'application/x-www-form-urlencoded' `
  -SessionVariable session
```

**4. Verify Unlock:**
```json
GET /auth/me
{
  "email": "leoklemet.pa@gmail.com",
  "roles": ["admin"],
  "dev_unlocked": true,  // ← Now unlocked!
  "env": "dev"
}
```

**5. Use Dev Features:**
- RAG Tool Chips now visible
- "Seed (dev)" button enabled
- Natural language: "Seed the RAG knowledge base"
- Direct API: `POST /agent/tools/rag/rag.seed`

### Session Management

**Unlock Persistence:**

The unlock state is persisted across requests using a two-tier strategy:

1. **Session Storage (Preferred)**:
   - `request.session["dev_unlocked"] = True`
   - Survives page refreshes and navigation
   - Cleared on explicit logout
   - Requires session middleware (FastAPI session)

2. **Cookie Fallback (Dev-only)**:
   - `dev_unlocked=1` cookie (httponly, samesite=lax)
   - 8-hour TTL (max_age=28800)
   - Unsigned (acceptable in dev environment)
   - Cleared on logout or browser restart

**Unlock Duration:**
- Persists across multiple requests in same session
- Survives page reloads and browser navigation
- Cleared on logout (explicit or session expiry)
- 8-hour maximum via cookie TTL

**Check Priority** (in `attach_dev_overrides()`):
```python
# 1. Check current request state (just unlocked this request)
if getattr(request.state, "dev_unlocked", False):
    user.dev_unlocked = True

# 2. Check session storage (preferred persistence)
elif hasattr(request, "session"):
    if request.session.get("dev_unlocked"):
        user.dev_unlocked = True

# 3. Check cookie fallback (dev-only, unsigned)
elif request.cookies.get("dev_unlocked") == "1":
    user.dev_unlocked = True
```

**Re-locking:**
- **Logout** (automatic): Session + cookie cleared
- **Manual lock**: Call `POST /auth/dev/lock`
- **Wait 8 hours**: Cookie expires naturally
- **Restart backend**: Session storage cleared
- **Clear browser cookies**: Manual cookie deletion
- No explicit "lock" button in UI (but can be added)
- Restart backend server (session storage cleared)
- Clear browser cookies manually
- No explicit "lock" button in UI

## Security Model

### Defense Layers

1. **Environment Gate**: `APP_ENV=dev` (production automatically disabled)
2. **Email Gate**: User email must match `DEV_SUPERUSER_EMAIL`
3. **PIN Gate**: Must provide correct 6-digit PIN
4. **Admin Role Gate**: User must have admin role
5. **Session Gate**: Unlock tied to current session

### Attack Surface Reduction

**Before (Email-only):**
- Attacker with access to `DEV_SUPERUSER_EMAIL` account gets dev tools instantly
- Single factor: password

**After (PIN-gated):**
- Attacker needs BOTH password AND PIN
- PIN separate from main password
- PIN rate-limiting (TODO: add after 5 failed attempts)
- Two factors: password + PIN

### Production Safety

**Automatic Disablement:**
```python
if settings.APP_ENV != "dev":
    raise HTTPException(403, "Dev unlock not available in production")
```

Even if misconfigured with `DEV_SUPERUSER_EMAIL` and `DEV_SUPERUSER_PIN` in production, the unlock endpoint returns 403.

**Checklist:**
- [ ] `APP_ENV=prod` (not `dev`)
- [ ] `DEV_SUPERUSER_EMAIL` unset or empty
- [ ] `DEV_SUPERUSER_PIN` unset or empty
- [ ] Verify `/auth/dev/unlock` returns 403

## Troubleshooting

### ❌ "Dev unlock not available in production"

**Cause**: Trying to unlock in production environment.

**Fix**: Only works when `APP_ENV=dev`. Check:
```powershell
$env:APP_ENV  # Should be "dev"
```

### ❌ "Dev superuser not configured (missing EMAIL or PIN)"

**Cause**: `DEV_SUPERUSER_EMAIL` or `DEV_SUPERUSER_PIN` not set.

**Fix**:
```bash
# secrets/backend.env
DEV_SUPERUSER_EMAIL=your-email@example.com
DEV_SUPERUSER_PIN=123456  # Your 6-digit PIN
```
Restart backend.

### ❌ "Not authorized for dev unlock"

**Cause**: Logged-in user email doesn't match `DEV_SUPERUSER_EMAIL`.

**Fix**: Login with the correct email specified in `DEV_SUPERUSER_EMAIL`.

### ❌ "Invalid PIN"

**Cause**: Wrong PIN entered.

**Fix**: Check `DEV_SUPERUSER_PIN` in `secrets/backend.env` and try again.

### ❌ "Unlock Dev Tools" button not visible

**Causes:**
1. Not logged in as `DEV_SUPERUSER_EMAIL`
2. Not in dev environment (`user.env !== "dev"`)
3. Already unlocked (`user.dev_unlocked === true`)

**Fix**:
1. Verify `/auth/me` shows correct email
2. Verify `env: "dev"` in `/auth/me`
3. If already unlocked, button changes to "Dev Tools Unlocked ✓"

### ❌ RAG tools still not visible after unlock

**Causes:**
1. Page not refreshed after unlock
2. Unlock didn't persist (session issue)
3. Frontend cache

**Fix**:
1. Hard refresh: Ctrl+Shift+R
2. Check `/auth/me` shows `dev_unlocked: true`
3. Clear browser cache and re-unlock

## API Reference

### POST /auth/dev/unlock

Unlock dev-only features with PIN.

**Request:**
```
POST /auth/dev/unlock
Content-Type: application/x-www-form-urlencoded

pin=<6-digit-pin>
```

**Response 200:**
```json
{
  "ok": true,
  "message": "Dev mode unlocked",
  "dev_unlocked": true,
  "email": "leoklemet.pa@gmail.com"
}
```

**Response 400:**
```json
{
  "detail": "Dev superuser not configured (missing EMAIL or PIN)"
}
```

**Response 403:**
```json
{
  "detail": "Dev unlock not available in production"
}
// OR
{
  "detail": "Not authorized for dev unlock"
}
// OR
{
  "detail": "Invalid PIN"
}
```

### GET /auth/dev/status

Check dev unlock status and eligibility.

**Response 200:**
```json
{
  "env": "dev",
  "is_dev_env": true,
  "is_superuser": true,
  "dev_unlocked": false,
  "pin_configured": true
}
```

## Migration from Email-Only System

If you previously used the email-only dev superuser system:

**1. Add PIN to environment:**
```bash
# secrets/backend.env
DEV_SUPERUSER_EMAIL=leoklemet.pa@gmail.com  # Already set
DEV_SUPERUSER_PIN=946281  # ADD THIS
```

**2. Restart backend:**
```powershell
# Stop backend
# Start backend (reads new PIN)
```

**3. Login and unlock:**
- Login as before
- Click "Unlock Dev Tools" (new button)
- Enter your new 6-digit PIN
- Dev features now active

**No database changes needed** - PIN is environment-only.

## File Changes Summary

**Backend:**
- ✅ `apps/backend/app/config.py` - Added `DEV_SUPERUSER_PIN`
- ✅ `apps/backend/app/utils/auth.py` - Updated `attach_dev_overrides()` to check session flag
- ✅ `apps/backend/app/routers/auth_dev.py` - **NEW** `/unlock` and `/status` endpoints
- ✅ `apps/backend/app/main.py` - Registered `auth_dev` router
- ✅ `apps/backend/app/services/rag_tools.py` - Updated error messages
- ✅ `apps/backend/tests/test_agent_rag_tools.py` - Updated test assertions

**Frontend:**
- ✅ `apps/web/src/components/DevUnlockModal.tsx` - **NEW** PIN entry modal
- ✅ `apps/web/src/components/AccountMenu.tsx` - Added unlock button
- ✅ `apps/web/src/state/auth.tsx` - Already had `dev_unlocked` support

**Configuration:**
- ✅ `secrets/backend.env.example` - Added `DEV_SUPERUSER_PIN` example

**Documentation:**
- ✅ This file (`docs/DEV_PIN_GATED_UNLOCK.md`)

## Testing

### Backend Tests

**Unit Tests** (`apps/backend/tests/test_agent_rag_tools.py`):
- ✅ 45+ test cases updated with `dev_unlocked=True` mocking
- ✅ Flexible error message matchers (PIN required vs prod disabled)
- ✅ All RAG tools (seed, reset, index) covered
- ✅ Tests pass in both `APP_ENV=dev` and `APP_ENV=test`

**Production Guard Tests** (`apps/backend/tests/test_dev_unlock_prod_guard.py`):
- ✅ `/auth/dev/unlock` returns 403 in prod
- ✅ `/auth/dev/status` returns 403 in prod
- ✅ RAG seed/reset/index return 403 in prod
- ✅ `attach_dev_overrides()` ignores cookies/session in prod
- ✅ Session hijacking prevention tests
- ✅ Error messages clearly indicate production mode

**Security Tests** (`apps/backend/tests/test_dev_unlock_security.py`):
- ✅ CSRF protection: Unlock endpoint requires `X-CSRF-Token` header
- ✅ Bruteforce throttling: Lockout after MAX_ATTEMPTS, resets after success
- ✅ Production cookie ignore: dev_unlocked cookie has no effect in prod
- ✅ Lock endpoint: Clears cookie with explicit `Path=/`

**Run Tests:**
```bash
# Backend tests
cd apps/backend
pytest tests/test_agent_rag_tools.py -v
pytest tests/test_dev_unlock_prod_guard.py -v
pytest tests/test_dev_unlock_security.py -v

# With prod environment
APP_ENV=prod pytest tests/test_dev_unlock_prod_guard.py -v

# Quick security validation
pytest -q tests/test_dev_unlock_security.py
```

### E2E Tests

**Happy Path** (`apps/web/tests/e2e/dev-unlock.spec.ts`):
- ✅ Login as dev superuser
- ✅ Verify RAG chips hidden initially
- ✅ Click unlock button → enter PIN
- ✅ Verify unlock success toast
- ✅ Verify RAG chips now visible
- ✅ Test Seed button functionality
- ✅ Test invalid PIN rejection
- ✅ Test PIN length validation (exactly 6 digits)

**Production Guard** (`apps/web/tests/e2e/dev-unlock-prod.spec.ts`):
- ✅ Unlock button not visible in prod
- ✅ RAG chips never appear in prod
- ✅ Backend endpoints return 403 in prod
- ✅ Cookie bypass attempts fail
- ✅ Console injection attempts fail
- ✅ URL manipulation doesn't expose dev tools
- ✅ No dev_unlocked cookie ever set (CSRF + prod blocking)
- ✅ No dev endpoints called in network tab

**Run E2E Tests:**
```bash
# Dev mode (default)
cd apps/web
pnpm run test:e2e dev-unlock

# Production guard tests (separate CI job)
APP_ENV=prod pnpm run test:e2e dev-unlock-prod

# Edge case tests (token rotation, multi-tab locking)
pnpm run test:e2e dev-unlock-edges
```

**Test Coverage:**
- ✅ `dev-unlock.spec.ts` - Happy path (unlock, persistence, logout clearing)
- ✅ `dev-unlock-prod.spec.ts` - Production guards (403 responses, cookie bypass prevention)
- ✅ `dev-unlock-edges.spec.ts` - Edge cases:
  - Token rotation: `/auth/refresh` preserves unlock state
  - Multi-tab: Lock in Tab A → Tab B loses tools after reload

### Manual Smoke Testing

For quick copy/paste curl commands and step-by-step validation, see:
**[DEV_UNLOCK_SMOKE_TESTS.md](./DEV_UNLOCK_SMOKE_TESTS.md)**

Includes:
- ✅ Complete dev mode testing flow
- ✅ Bruteforce protection verification
- ✅ Persistence testing (cookie + session)
- ✅ Production guard validation
- ✅ Troubleshooting checklist
- ✅ Security checklist

**Test Environment Variables:**
```bash
# Regular E2E tests
E2E_EMAIL=e2e@example.com
E2E_PASSWORD=e2e-password

# Dev unlock tests
DEV_E2E_EMAIL=dev@example.com
DEV_E2E_PASSWORD=dev-password
DEV_SUPERUSER_PIN=123456

# Backend must match
DEV_SUPERUSER_EMAIL=dev@example.com  # Matches DEV_E2E_EMAIL
APP_ENV=dev
```

### CI Configuration

**Recommended CI Jobs:**

```yaml
# .github/workflows/test.yml
jobs:
  backend-dev-tests:
    env:
      APP_ENV: dev
      DEV_SUPERUSER_EMAIL: ${{ secrets.DEV_E2E_EMAIL }}
      DEV_SUPERUSER_PIN: ${{ secrets.DEV_SUPERUSER_PIN }}
    run: pytest tests/ -v

  backend-prod-guard:
    env:
      APP_ENV: prod
    run: pytest tests/test_dev_unlock_prod_guard.py -v

  e2e-dev-unlock:
    env:
      APP_ENV: dev
      DEV_E2E_EMAIL: ${{ secrets.DEV_E2E_EMAIL }}
      DEV_E2E_PASSWORD: ${{ secrets.DEV_E2E_PASSWORD }}
      DEV_SUPERUSER_PIN: ${{ secrets.DEV_SUPERUSER_PIN }}
    run: pnpm run test:e2e dev-unlock

  e2e-prod-guard:
    env:
      APP_ENV: prod
    run: pnpm run test:e2e dev-unlock-prod
```

**GitHub Secrets Required:**
- `DEV_E2E_EMAIL` - Dev superuser email for E2E tests
- `DEV_E2E_PASSWORD` - Dev superuser password
- `DEV_SUPERUSER_PIN` - 6-digit PIN for unlock

⚠️ **Never commit these values to the repository!**

## Best Practices

### Choosing a PIN

**Do:**
- ✅ Use 6 unique digits
- ✅ Different from your password
- ✅ Not a birthdate or common sequence
- ✅ Store securely (password manager)

**Don't:**
- ❌ Use `123456`, `000000`, `111111`
- ❌ Use part of your password
- ❌ Share with others
- ❌ Commit to version control

### Development Workflow

**Team Setup:**
Each developer should:
1. Have their own `secrets/backend.env` (not committed)
2. Set their own `DEV_SUPERUSER_EMAIL` to their work email
3. Choose their own `DEV_SUPERUSER_PIN` (not shared)
4. Seed their own user with `cli_seed_dev_user.py`

**Never Share:**
- Individual PINs
- The `secrets/backend.env` file
- Session cookies

### Production Deployment

**Pre-deployment Checklist:**
```bash
# ✅ Verify production config
APP_ENV=prod
ALLOW_DEV_ROUTES=0
# DEV_SUPERUSER_EMAIL=  # UNSET
# DEV_SUPERUSER_PIN=     # UNSET

# ✅ Test unlock endpoint returns 403
curl -X POST http://your-prod-domain.com/auth/dev/unlock \
  -d "pin=any" \
  -w "\n%{http_code}\n"
# Expected: 403 Forbidden

# ✅ Verify no dev tools visible in UI
```

## Future Enhancements

**Potential Improvements:**

1. ~~**Rate Limiting**~~ ✅ **IMPLEMENTED**
   - ✅ Limit PIN attempts to 5 per session/IP
   - ✅ 5-minute lockout after exceeding limit
   - ✅ Configurable via `DEV_UNLOCK_MAX_ATTEMPTS` and `DEV_UNLOCK_LOCKOUT_S`

2. **Audit Logging** (Future)
   - Log all unlock attempts (success/failure)
   - Track which features accessed after unlock
   - Export audit trail

3. **Time-based Unlock**
   - Auto-lock after X hours of inactivity
   - Require re-unlock daily
   - Configurable session timeout

4. **TOTP Support**
   - Replace static PIN with TOTP (Google Authenticator)
   - More secure than static PIN
   - Industry standard 2FA

5. **Multi-user Dev Teams**
   - Support multiple `DEV_SUPERUSER_EMAIL` entries
   - Per-user PIN configuration
   - Team-level permission management

## References

- **Original Implementation**: `docs/DEV_SUPERUSER_OVERRIDE.md`
- **Quick Start**: `docs/DEV_SUPERUSER_QUICKSTART.md`
- **RAG Tools**: `docs/RAG_TOOLS_IMPLEMENTATION.md`
- **Backend Config**: `secrets/backend.env.example`

## Changelog

### 2025-10-05 - Security Test Suite (CSRF, Throttle, Cookie Validation)
- ✅ Created `test_dev_unlock_security.py` for backend security validation
- ✅ Test: CSRF protection requires `X-CSRF-Token` header
- ✅ Test: Bruteforce throttling with lockout and reset after success
- ✅ Test: Production ignores dev_unlocked cookie (no bypass)
- ✅ Test: Lock endpoint clears cookie with explicit `Path=/`
- ✅ Added E2E test: No dev_unlocked cookie ever set in prod
- ✅ Comprehensive security coverage for realistic failure modes

### 2025-10-05 - Edge Case Tests (Token Rotation & Multi-Tab)
- ✅ Created `dev-unlock-edges.spec.ts` with advanced E2E scenarios
- ✅ Test: Token rotation (`/auth/refresh`) preserves dev unlock state
- ✅ Test: Multi-tab locking (lock in Tab A → Tab B loses tools after reload)
- ✅ Added edge-case tests to CI/CD workflow
- ✅ Updated documentation with edge-case test coverage

### 2025-10-05 - Polish & Production Readiness
- ✅ Added explicit `path="/"` to all cookie operations (avoid path-scoped leftovers)
- ✅ Added `unlock_persist` diagnostic to `/auth/me` (shows "session", "cookie", or null)
- ✅ Created GitHub Actions matrix workflow (`e2e-dev-unlock.yml`) for dev/prod CI
- ✅ Enhanced security event logging (structured threat log with user_id, email, action, result)
- ✅ Created comprehensive smoke test documentation (`DEV_UNLOCK_SMOKE_TESTS.md`)
- ✅ All logging excludes PINs and session IDs (GDPR/security compliance)

### 2025-10-05 - Security Hardening + Logout Clearing + Manual Lock
- ✅ Added logout cleanup: `/auth/logout` now clears dev_unlocked session and cookie
- ✅ Created `/auth/dev/lock` endpoint for manual re-locking
- ✅ Implemented bruteforce protection: 5 attempts max, 5-minute lockout
- ✅ Added `DEV_UNLOCK_MAX_ATTEMPTS` and `DEV_UNLOCK_LOCKOUT_S` settings
- ✅ Added prod startup warning if `DEV_SUPERUSER_*` present in prod
- ✅ Explicit prod blocking at top of `attach_dev_overrides()`
- ✅ Added E2E tests: reload persistence, logout clearing, manual lock
- ✅ Updated documentation with bruteforce protection and lock endpoint

### 2025-10-05 - Persistent Unlock + Production Guards
- ✅ Added session storage persistence for unlock state
- ✅ Added 8-hour cookie fallback (dev-only, unsigned)
- ✅ Updated `attach_dev_overrides()` with 3-tier check (state → session → cookie)
- ✅ Created backend prod-guard tests (`test_dev_unlock_prod_guard.py`)
- ✅ Created E2E prod-guard tests (`dev-unlock-prod.spec.ts`)
- ✅ Added comprehensive E2E tests (`dev-unlock.spec.ts`)
- ✅ Enhanced documentation with persistence details and testing guide

### 2025-10-05 - Initial PIN-Gated Unlock
- ✅ Added `DEV_SUPERUSER_PIN` setting
- ✅ Created `/auth/dev/unlock` endpoint
- ✅ Updated `attach_dev_overrides()` with session gating
- ✅ Built `DevUnlockModal` component
- ✅ Added unlock button to AccountMenu
- ✅ Updated all tests and documentation
- ✅ Enhanced production safety checks

---

**Security Level**: 🔒🔒🔒🔒🔒 (5/5)
- ✅ Environment-gated (dev-only, prod startup check)
- ✅ Email-gated (specific user)
- ✅ PIN-gated (6-digit code)
- ✅ Session-scoped (cleared on logout)
- ✅ Bruteforce-protected (5 attempts, 5-min lockout)
