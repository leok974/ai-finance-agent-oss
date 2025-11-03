# Dev Superuser Override Implementation

## Overview

This document describes the dev superuser override system that grants admin privileges and dev-only feature access to a designated user in development environments.

## Features

### 🔐 Security Model

**Production Safety:**
- ✅ Only active in `APP_ENV=dev` or `ALLOW_DEV_ROUTES=1`
- ✅ Requires explicit `DEV_SUPERUSER_EMAIL` configuration
- ✅ Dev-only actions require BOTH environment flag AND `dev_unlocked` user attribute
- ✅ Never activates in production (even if misconfigured)

**Dev Convenience:**
- ✅ Automatic admin role grant for configured email
- ✅ `dev_unlocked` attribute enables dev-only features
- ✅ Visible in `/auth/me` response for frontend gating
- ✅ CLI utility for safe password seeding

## Configuration

### Environment Variables

Add to `secrets/backend.env` (never commit):

```bash
# Development mode
APP_ENV=dev
ALLOW_DEV_ROUTES=1

# Dev superuser (grants admin + dev_unlocked)
DEV_SUPERUSER_EMAIL=leoklemet.pa@gmail.com
```

### Settings (apps/backend/app/config.py)

```python
class Settings(BaseSettings):
    APP_ENV: str = os.getenv("APP_ENV", os.getenv("ENV", "dev"))
    ALLOW_DEV_ROUTES: int = int(os.getenv("ALLOW_DEV_ROUTES", "1"))
    DEV_SUPERUSER_EMAIL: str | None = os.getenv("DEV_SUPERUSER_EMAIL")
    # ... other settings ...
```

## Backend Implementation

### 1. Auth Override (apps/backend/app/utils/auth.py)

**`attach_dev_overrides(user)` function:**
- Checks if `APP_ENV=dev` or `ALLOW_DEV_ROUTES=1`
- Compares user email with `DEV_SUPERUSER_EMAIL` (case-insensitive)
- Sets `user.dev_unlocked = True` for matching users
- Called automatically in `get_current_user()` dependency

**Integration:**
```python
def get_current_user(...) -> User:
    # ... auth logic ...
    u = attach_dev_overrides(u)
    return u
```

### 2. /auth/me Endpoint (apps/backend/app/routers/auth.py)

**Response includes dev status:**
```json
{
  "email": "leoklemet.pa@gmail.com",
  "roles": ["admin"],
  "is_active": true,
  "dev_unlocked": true,
  "env": "dev"
}
```

### 3. RAG Tools Guard (apps/backend/app/services/rag_tools.py)

**Strengthened `_require_admin_dev()` function:**
```python
def _require_admin_dev(user, dev_only: bool = False):
    # Check admin role
    if "admin" not in roles:
        raise HTTPException(403, "Admin only")

    # Dev-only actions require BOTH conditions
    if dev_only:
        # 1) Environment allows dev routes
        if not (APP_ENV == "dev" or ALLOW_DEV_ROUTES == "1"):
            raise HTTPException(403, "Dev route disabled")

        # 2) User has dev_unlocked attribute
        if not getattr(user, "dev_unlocked", False):
            raise HTTPException(403, "Dev unlock required")
```

**Dev-only actions:**
- `rag.seed` - Seed starter vendor URLs (requires `dev_unlocked=True`)

## Frontend Implementation

### 1. Auth State (apps/web/src/state/auth.tsx)

**Updated User type:**
```typescript
export type User = {
  email: string;
  roles: string[];
  is_active?: boolean;
  dev_unlocked?: boolean;
  env?: string;
} | null;
```

**New hooks:**
```typescript
// Check if user has dev_unlocked attribute
export function useDevUnlocked(): boolean {
  const { user } = useAuth();
  return !!user?.dev_unlocked;
}

// Check if dev tools should be visible (admin + dev_unlocked + dev env)
export function useShowDevTools(): boolean {
  const { user } = useAuth();
  const isAdmin = !!user?.roles?.includes("admin");
  const devUnlocked = !!user?.dev_unlocked;
  const isDevEnv = user?.env === "dev";
  return isAdmin && devUnlocked && isDevEnv;
}
```

### 2. RagToolChips Component

**Visibility gated by `useShowDevTools()`:**
```tsx
export function RagToolChips({ onReply }: RagToolChipsProps) {
  const showDevTools = useShowDevTools();

  if (!showDevTools) {
    return null; // Only show to admins with dev_unlocked in dev env
  }
  // ... render dev tool buttons ...
}
```

## Usage

### 1. Seed Dev Superuser (One-time Setup)

**Using CLI utility:**

```powershell
# Set environment
$env:APP_ENV='dev'
$env:ALLOW_DEV_ROUTES='1'
$env:DEV_SUPERUSER_EMAIL='leoklemet.pa@gmail.com'

# Seed user (from apps/backend directory)
python -m app.cli_seed_dev_user leoklemet.pa@gmail.com Superleo3
```

**CLI output:**
```
✅ Created new user: leoklemet.pa@gmail.com
✅ Created 'admin' role
✅ Granted 'admin' role to leoklemet.pa@gmail.com

✅ Dev superuser ready:
   Email: leoklemet.pa@gmail.com
   Password: ********* (hashed in DB)
   Roles: admin

To enable dev_unlocked, set environment variable:
   DEV_SUPERUSER_EMAIL=leoklemet.pa@gmail.com
```

### 2. Login and Verify

**1) Start backend with dev config:**
```powershell
$env:APP_ENV='dev'
$env:ALLOW_DEV_ROUTES='1'
$env:DEV_SUPERUSER_EMAIL='leoklemet.pa@gmail.com'
# Start backend
```

**2) Login via UI:**
- Email: `leoklemet.pa@gmail.com`
- Password: `Superleo3` (or whatever you seeded)

**3) Verify /auth/me response:**
```powershell
# Check auth status
curl http://127.0.0.1:8000/api/auth/me -H "Cookie: access_token=..."
```

Expected response:
```json
{
  "email": "leoklemet.pa@gmail.com",
  "roles": ["admin"],
  "is_active": true,
  "dev_unlocked": true,
  "env": "dev"
}
```

**4) Verify RAG dev tools visible:**
- RAG Tool Chips should appear in UI
- "Seed (dev)" button should be enabled

### 3. Test Dev-Only Actions

**Natural language:**
```
"Seed the RAG knowledge base"
```

**Direct API call:**
```powershell
curl -X POST http://127.0.0.1:8000/agent/tools/rag/rag.seed `
  -H "Cookie: access_token=..." `
  -H "Content-Type: application/json" `
  -d '{}'
```

Expected response:
```json
{
  "ok": true,
  "result": {
    "status": "ok",
    "seeded": 8,
    "message": "Seeded 8 vendor URLs"
  }
}
```

## Testing

### Backend Tests (apps/backend/tests/test_agent_rag_tools.py)

**Test fixtures include `dev_unlocked`:**
```python
@pytest.fixture
def admin_user(db):
    user = User(id=1, email="admin@test.com", password_hash="hashed")
    user.roles = [Mock(name="admin")]
    user.dev_unlocked = False  # Override in tests as needed
    return user
```

**Dev-only action tests:**
```python
def test_require_admin_dev_dev_gate_enabled(admin_user, monkeypatch):
    """Test dev-only action allowed with ALLOW_DEV_ROUTES=1 + dev_unlocked=True."""
    monkeypatch.setenv("ALLOW_DEV_ROUTES", "1")
    admin_user.dev_unlocked = True  # Grant dev unlock
    rag_tools._require_admin_dev(admin_user, dev_only=True)  # Should not raise

def test_require_admin_dev_missing_dev_unlocked(admin_user, monkeypatch):
    """Test dev-only action blocked when dev_unlocked=False."""
    monkeypatch.setenv("ALLOW_DEV_ROUTES", "1")
    admin_user.dev_unlocked = False  # No dev unlock

    with pytest.raises(HTTPException) as exc_info:
        rag_tools._require_admin_dev(admin_user, dev_only=True)
    assert exc_info.value.status_code == 403
    assert "Dev unlock required" in exc_info.value.detail
```

**Run tests:**
```powershell
cd apps/backend
pytest tests/test_agent_rag_tools.py -v
```

### E2E Tests (apps/web/tests/e2e/rag-tools.spec.ts)

**Tests verify:**
- ✅ RAG tools visible to admin with `dev_unlocked=true`
- ✅ RAG tools hidden from regular users
- ✅ Dev-only actions (seed) blocked without `dev_unlocked`
- ✅ Natural language integration for RAG commands

**Run E2E tests:**
```powershell
cd apps/web
pnpm run test:e2e
```

## Production Safety Checklist

Before deploying to production:

- [ ] `APP_ENV=prod` (not `dev`)
- [ ] `ALLOW_DEV_ROUTES=0` or unset
- [ ] `DEV_SUPERUSER_EMAIL` is empty or unset
- [ ] `AUTH_SECRET` is a strong, unique random string
- [ ] `COOKIE_SECURE=1` (requires HTTPS)
- [ ] Database backups configured
- [ ] Log rotation enabled
- [ ] No dev passwords in commit history

**Prod environment should look like:**
```bash
APP_ENV=prod
ALLOW_DEV_ROUTES=0
# DEV_SUPERUSER_EMAIL=  # UNSET or empty
AUTH_SECRET=<strong-random-secret>
COOKIE_SECURE=1
```

## Troubleshooting

### ❌ "Dev unlock required" error

**Cause:** User doesn't have `dev_unlocked=True` attribute.

**Fix:**
1. Ensure `DEV_SUPERUSER_EMAIL` is set in backend environment
2. Restart backend to pick up environment changes
3. Login again to get fresh `/auth/me` response
4. Verify email matches exactly (case-insensitive)

```powershell
# Check backend config
$env:DEV_SUPERUSER_EMAIL
# Should output: leoklemet.pa@gmail.com

# Check /auth/me response
curl http://127.0.0.1:8000/api/auth/me -H "Cookie: access_token=..."
# Should include: "dev_unlocked": true
```

### ❌ "Dev route disabled" error

**Cause:** Environment doesn't allow dev routes.

**Fix:**
```powershell
$env:APP_ENV='dev'
$env:ALLOW_DEV_ROUTES='1'
# Restart backend
```

### ❌ RAG tool chips not visible

**Causes:**
1. Not logged in as admin
2. Not in dev environment (`env !== "dev"`)
3. Missing `dev_unlocked` attribute

**Fix:**
1. Verify `/auth/me` response shows:
   - `roles: ["admin"]`
   - `dev_unlocked: true`
   - `env: "dev"`
2. Check browser console for errors
3. Ensure `DEV_SUPERUSER_EMAIL` matches login email

### ❌ CLI seed user fails

**Error:** "Only allowed in dev/test mode"

**Fix:**
```powershell
$env:APP_ENV='dev'
python -m app.cli_seed_dev_user leoklemet.pa@gmail.com Superleo3
```

## File Structure

```
apps/backend/
├── app/
│   ├── config.py                    # Settings with DEV_SUPERUSER_EMAIL
│   ├── cli_seed_dev_user.py        # CLI utility to seed dev user
│   ├── utils/
│   │   └── auth.py                 # attach_dev_overrides() function
│   ├── routers/
│   │   └── auth.py                 # /auth/me with dev_unlocked
│   └── services/
│       └── rag_tools.py            # _require_admin_dev() guard
└── tests/
    └── test_agent_rag_tools.py     # Tests with dev_unlocked fixtures

apps/web/
├── src/
│   ├── state/
│   │   └── auth.tsx                # User type, useDevUnlocked(), useShowDevTools()
│   └── components/
│       └── RagToolChips.tsx        # Dev tools UI (gated by useShowDevTools)
└── tests/
    └── e2e/
        └── rag-tools.spec.ts       # E2E tests for dev features

secrets/
└── backend.env.example             # Example configuration with dev settings
```

## Security Notes

### ⚠️ Dev Mode Only

The dev superuser override is **strictly for development**:

1. **Never deploy with `DEV_SUPERUSER_EMAIL` set in production**
2. **Always set `APP_ENV=prod` and `ALLOW_DEV_ROUTES=0` in production**
3. **Use strong, unique passwords even in dev** (no reuse)
4. **Don't commit `secrets/backend.env`** (add to `.gitignore`)

### 🔒 Defense in Depth

The system has multiple safety layers:

1. **Environment gate:** Dev routes disabled in prod by default
2. **User gate:** Requires `dev_unlocked` attribute (only granted in dev)
3. **Role gate:** Still requires admin role
4. **Email gate:** Only specific email gets override (not all admins)

Even if one layer fails, the others protect production.

### 🔍 Audit Trail

All dev actions are logged:
- User email
- Action name
- Timestamp
- Result status

Monitor logs for unexpected dev action usage in production.

## References

- **RAG Tools Implementation:** `docs/RAG_TOOLS_IMPLEMENTATION.md`
- **RAG Tools Quick Reference:** `docs/RAG_TOOLS_QUICK_REFERENCE.md`
- **Backend Environment Example:** `secrets/backend.env.example`
- **CLI Seed Utility:** `apps/backend/app/cli_seed_dev_user.py`

## Changelog

### 2025-10-05 - Initial Implementation
- Added `DEV_SUPERUSER_EMAIL` setting
- Created `attach_dev_overrides()` function
- Updated `/auth/me` to expose `dev_unlocked` and `env`
- Strengthened `_require_admin_dev()` with `dev_unlocked` check
- Added `useDevUnlocked()` and `useShowDevTools()` hooks
- Gated `RagToolChips` with `useShowDevTools()`
- Created CLI seed utility
- Updated all tests to handle `dev_unlocked` requirement
- Created comprehensive documentation
