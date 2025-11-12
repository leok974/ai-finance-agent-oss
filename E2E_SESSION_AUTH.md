# E2E Test Session Authentication

Automated session management for E2E tests - no more manual cookie capture!

## Overview

This system allows Playwright tests to automatically authenticate without going through the Google OAuth flow manually. It's based on a secure HMAC-signed endpoint that mints test sessions.

## How It Works

1. **Backend Endpoint** (`/api/e2e/session`):
   - Only active when `E2E_SESSION_ENABLED=1`
   - Requires HMAC signature with shared secret
   - Creates authenticated session cookie
   - Audit logged

2. **Playwright Global Setup** (`tests/e2e/global-setup.ts`):
   - Runs before all tests
   - Signs request with HMAC
   - Calls session mint endpoint
   - Saves cookies to `tests/e2e/.auth/prod-state.json`

3. **Tests Use Saved State**:
   - `chromium-prod` project automatically loads saved cookies
   - No manual login required

## Setup

### 1. Backend Configuration

Create `.env` or add to existing:

```bash
# Enable E2E session endpoint
E2E_SESSION_ENABLED=1

# Generate secret: openssl rand -hex 32
E2E_SESSION_HMAC_SECRET=your_64_char_hex_secret_here

# Test user (must exist in database with proper roles)
E2E_USER=e2e@ledgermind.org
```

### 2. Create E2E Test User

The user specified in `E2E_USER` must exist in your database:

```sql
INSERT INTO users (email, name, is_active)
VALUES ('e2e@ledgermind.org', 'E2E Test User', true);

-- Assign roles as needed
INSERT INTO user_roles (user_id, role_id)
SELECT users.id, roles.id
FROM users, roles
WHERE users.email = 'e2e@ledgermind.org'
  AND roles.name = 'user';
```

### 3. Frontend Configuration

Add to `apps/web/.env` or `.env.local`:

```bash
BASE_URL=https://app.ledger-mind.org
E2E_SESSION_HMAC_SECRET=same_secret_as_backend
E2E_USER=e2e@ledgermind.org
```

## Usage

### Run Tests with Auto-Login

```bash
# Production tests with automatic session minting
pnpm test:e2e:prod:auto

# Or manually
cd apps/web
BASE_URL=https://app.ledger-mind.org \
E2E_SESSION_HMAC_SECRET=your_secret \
pnpm exec playwright test --project=chromium-prod
```

### First Run

On first run, global setup will:
1. Create HMAC signature
2. Call `/api/e2e/session`
3. Save cookies to `tests/e2e/.auth/prod-state.json`

Subsequent test runs reuse the saved state unless it expires.

## Security

### HMAC Signature

Each request is signed with:
```
HMAC-SHA256(user.timestamp, secret)
```

- **Timestamp**: Unix seconds (±120s tolerance for clock skew)
- **Secret**: 64-character hex string (256 bits)
- **Comparison**: Constant-time to prevent timing attacks

### Guards

1. **Feature Flag**: Endpoint returns 404 when `E2E_SESSION_ENABLED=0`
2. **Replay Prevention**: Timestamp must be ±120s of server time
3. **Short-Lived**: Minted sessions expire in 1 hour
4. **Audit Log**: All session mints logged with user, timestamp, IP, User-Agent, CF-Ray

### Optional Hardening

Add to backend endpoint (in `apps/backend/app/routers/e2e_session.py`):

```python
# Require Cloudflare Access service token
cf_client_id = request.headers.get("CF-Access-Client-Id")
cf_client_secret = request.headers.get("CF-Access-Client-Secret")
if not cf_client_id or not cf_client_secret:
    raise HTTPException(401, "CF Access required")

# Or IP allowlist
allowed_ips = ["192.168.1.0/24", "10.0.0.0/8"]
if request.client.host not in allowed_ips:
    raise HTTPException(403, "IP not allowed")
```

## Troubleshooting

### "E2E session mint failed: 404"

- Check `E2E_SESSION_ENABLED=1` in backend `.env`
- Restart backend to pick up new config

### "Invalid signature"

- Verify `E2E_SESSION_HMAC_SECRET` matches on backend and frontend
- Check for trailing whitespace in secret
- Ensure secret is same 64-char hex value

### "Timestamp expired"

- Check server/client clock sync
- Verify ±120s tolerance is sufficient
- Check for system time drift

### "User not found" or 401 after login

- Verify `E2E_USER` exists in database
- Check user has required roles
- Ensure user `is_active = true`

### Tests still failing after session mint

- Check `tests/e2e/.auth/prod-state.json` was created
- Verify playwright config uses correct `storageState` path
- Try deleting `prod-state.json` to force fresh mint

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run E2E Tests
  env:
    BASE_URL: https://staging.ledger-mind.org
    E2E_SESSION_HMAC_SECRET: ${{ secrets.E2E_SESSION_HMAC_SECRET }}
    E2E_USER: e2e@ledgermind.org
  run: |
    cd apps/web
    pnpm exec playwright test --project=chromium-prod
```

### Environment-Specific Secrets

- **Dev**: `.env.local` (gitignored)
- **Staging**: CI secrets
- **Production**: CI secrets + optional CF Access

## Manual Cookie Capture (Legacy)

The old manual capture method still works:

```bash
# 1. Login manually to https://app.ledger-mind.org
# 2. Run capture script
pnpm test:e2e:prod:capture
```

But with automated session minting, this is no longer needed!

## Files

- `apps/backend/app/routers/e2e_session.py` - Session mint endpoint
- `apps/backend/app/auth/session.py` - Session helper
- `apps/backend/app/config.py` - Configuration settings
- `apps/web/tests/e2e/global-setup.ts` - Playwright global setup
- `apps/web/playwright.config.ts` - Test configuration
- `apps/web/tests/e2e/.auth/prod-state.json` - Saved session (gitignored)

## References

- [Playwright Authentication](https://playwright.dev/docs/auth)
- [HMAC Authentication](https://en.wikipedia.org/wiki/HMAC)
- [Cloudflare Access Service Tokens](https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/)
