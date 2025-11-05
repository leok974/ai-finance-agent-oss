# LedgerMind Dev Override (Canonical)

## Canonical Environment Variables (LM_*)

**Primary names** (use these in all new configurations):
- `LM_DEV_SUPER_EMAIL` - Email allowlist for dev unlock
- `LM_DEV_SUPER_PIN` - 8-digit PIN for authentication
- `LM_DEV_ENABLE_TOKEN` - Bearer token for overlay enable
- `LM_DEV_COOKIE_KEY` - HMAC-SHA256 signing key (64+ chars)

**Legacy aliases** (supported for backward compatibility):
- `DEV_SUPERUSER_EMAIL` → `LM_DEV_SUPER_EMAIL`
- `DEV_SUPERUSER_PIN` → `LM_DEV_SUPER_PIN`
- `SITEAGENT_DEV_ENABLE_TOKEN` → `LM_DEV_ENABLE_TOKEN`
- `SITEAGENT_DEV_COOKIE_KEY` → `LM_DEV_COOKIE_KEY`

**Resolution order:** LM_* primary names win if present, fallback to legacy aliases.

## API Endpoints

### Authentication-Required (PIN Unlock)
- `POST /auth/dev/unlock` - Submit PIN to unlock dev features (requires login as superuser)
- `POST /auth/dev/lock` - Manually disable dev mode
- `GET /auth/dev/status` - Check unlock status (requires authentication)

### Public (Overlay Toggle)
- `GET /agent/dev/status` - Check overlay cookie status (public)
- `GET /agent/dev/enable` - Enable overlay (requires Bearer token)
- `GET /agent/dev/disable` - Disable overlay (public)

## Security Model

### PIN Unlock Flow
1. User logs in with email matching `LM_DEV_SUPER_EMAIL`
2. User submits PIN via `POST /auth/dev/unlock`
3. Backend validates PIN against `LM_DEV_SUPER_PIN`
4. On success:
   - Sets `dev_unlocked=1` cookie (8h TTL)
   - Sets `request.session["dev_unlocked"] = True`
   - Grants runtime admin role
   - Enables RAG tools access

### Overlay Toggle Flow
1. Client sends `Authorization: Bearer <LM_DEV_ENABLE_TOKEN>`
2. Backend validates token
3. Sets signed cookie `sa_dev=1.timestamp.hmac` (14 days)
4. Cookie enables frontend dev overlay features

### Bruteforce Protection
- Max attempts: 5 (configurable via `DEV_UNLOCK_MAX_ATTEMPTS`)
- Lockout duration: 5 minutes (configurable via `DEV_UNLOCK_LOCKOUT_S`)
- In-memory throttling per session/IP

### Production Safety
- **CRITICAL:** Dev features are **disabled** when `APP_ENV=prod`
- **Endpoints behavior:**
  - `APP_ENV=prod` → Endpoints exist in OpenAPI but return `401`/`403` (gated)
  - `APP_ENV=dev` → Full unlock flow enabled with PIN/token
- Backend logs warning if dev vars present in prod environment
- Overlay cookies ignored in production (feature flag check)

## Configuration

### Development Environment
```bash
# secrets/backend.env
APP_ENV=dev
LM_DEV_SUPER_EMAIL=you@example.com
LM_DEV_SUPER_PIN=12345678
LM_DEV_ENABLE_TOKEN=<32-char-random>
LM_DEV_COOKIE_KEY=<64-char-random>
```

### Production Environment (Recommended)
```bash
# secrets/backend.env
APP_ENV=prod
# Do NOT set LM_DEV_* variables in production
```

## Testing

### Local Development
```bash
# 1. Set APP_ENV=dev in docker-compose.yml
# 2. Restart backend
docker compose up -d backend

# 3. Test overlay enable
curl -H "Authorization: Bearer <LM_DEV_ENABLE_TOKEN>" \
  http://localhost/agent/dev/enable

# 4. Test PIN unlock (after browser login)
curl -X POST http://localhost/auth/dev/unlock \
  -H "Cookie: session=<your-session>" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "pin=12345678"
```

### Verification
```bash
# Check OpenAPI for available endpoints
curl -s http://localhost/openapi.json | jq -r '.paths | keys[]' | grep dev

# Check overlay status
curl -s http://localhost/agent/dev/status

# Check unlock status (requires auth)
curl -s http://localhost/auth/dev/status -H "Cookie: session=<cookie>"
```

## Code References

### Backend Configuration
- **Config:** `apps/backend/app/config.py` - Settings with LM_* aliases
- **Auth Router:** `apps/backend/app/routers/auth_dev.py` - PIN unlock endpoints
- **Overlay Router:** `apps/backend/app/routers/dev_overlay.py` - Overlay toggle endpoints
- **Secrets:** `secrets/backend.env` - Environment variables (gitignored)

### Key Functions
```python
# apps/backend/app/config.py
def _alias(primary: str, *fallbacks: str, default: str | None = None) -> str | None:
    """Get env var with fallback aliases. Primary name wins if present."""
    # LM_* names take precedence over legacy SITEAGENT_* / DEV_SUPERUSER_*
```

## Migration Guide

### From SITEAGENT_* to LM_*
1. Update `secrets/backend.env`:
   ```bash
   # Old
   SITEAGENT_DEV_ENABLE_TOKEN=xxx
   SITEAGENT_DEV_COOKIE_KEY=yyy

   # New
   LM_DEV_ENABLE_TOKEN=xxx
   LM_DEV_COOKIE_KEY=yyy
   ```

2. Restart backend:
   ```bash
   docker compose -f docker-compose.prod.yml restart backend
   ```

3. Verify (old variables still work due to aliases):
   ```bash
   docker logs backend --tail=50 | grep -i "dev\|override"
   ```

### From DEV_SUPERUSER_* to LM_DEV_SUPER_*
Same process - update env file, restart, verify. Code automatically handles fallback.

## Monitoring & Logging

### Security Events
Backend logs all dev unlock attempts with:
- ✅ Success: `✅ SECURITY: Dev unlock SUCCESS | user_id=X email=Y`
- 🚫 Failure: `🚫 SECURITY: Dev unlock failed | reason=invalid_pin attempts=N/5`
- 🔒 Lockout: `🚫 SECURITY: Dev unlock LOCKED OUT | lockout_duration=300s`

**Log Hygiene:** Never log secrets (PIN, tokens, cookie keys) in application logs.

### Prometheus Metrics (Optional)
```yaml
# Example alert
- alert: DevUnlockAttempts
  expr: increase(dev_unlock_attempts_total[5m]) > 10
  labels:
    severity: warning
```

## Maintenance & Rotation

### Secret Rotation Cadence
- **LM_DEV_ENABLE_TOKEN:** Rotate quarterly or after any compromise
- **LM_DEV_COOKIE_KEY:** Rotate quarterly with token
- **LM_DEV_SUPER_PIN:** Rotate before each demo/training cycle or quarterly
- **LM_DEV_SUPER_EMAIL:** Update when superuser changes

### Rotation Procedure
```powershell
# 1. Generate new secrets
$NEW_TOKEN = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
$NEW_KEY = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
$NEW_PIN = -join ((0..9) | Get-Random -Count 8)

# 2. Update secrets/backend.env
# Replace old values with new ones

# 3. Restart backend
docker compose -f docker-compose.prod.yml restart backend

# 4. Verify
docker exec backend printenv | grep LM_DEV_ | cut -d= -f1
```

### Deprecation Plan
- **Phase 1 (Current):** LM_* primary, legacy aliases supported via `_alias()`
- **Phase 2 (Target: 2026-Q2):** Log warnings when legacy vars detected
- **Phase 3 (Target: 2026-Q4):** Remove `_alias()` fallback, LM_* only

## FAQ

**Q: Can I use both LM_* and legacy names?**
A: Yes, but LM_* takes precedence. Code checks LM_* first, then falls back to legacy.

**Q: Why the migration from SITEAGENT_* ?**
A: LedgerMind-specific naming prevents Copilot confusion with unrelated projects using similar names.

**Q: What happens if I set dev vars in production?**
A: Backend logs a warning and **ignores** them. Features are disabled when `APP_ENV=prod`.

**Q: How do I rotate the PIN/tokens?**
A: Update values in `secrets/backend.env`, restart backend. Old values immediately invalid.

**Q: Can I disable dev features completely?**
A: Yes - remove all `LM_DEV_*` variables from secrets and restart backend.

## Version History

- **2025-11-03:** Migrated from `SITEAGENT_*` to `LM_DEV_*` canonical names
- **2025-10:** Added `DEV_SUPERUSER_*` PIN unlock feature
- **2025-09:** Initial dev overlay with `SITEAGENT_*` names
