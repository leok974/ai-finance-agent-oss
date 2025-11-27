# Dev Unlock Smoke Tests

Quick copy/paste commands for manual testing of the PIN-gated dev unlock system.

## Prerequisites

Ensure backend is running locally:
```powershell
cd apps/backend
uvicorn app.main:app --reload --port 8000
```

## DEV Mode Testing

Set up dev environment:
```powershell
$env:APP_ENV='dev'
$env:ALLOW_DEV_ROUTES='1'
$env:DEV_SUPERUSER_EMAIL='leoklemet.pa@gmail.com'
$env:DEV_SUPERUSER_PIN='946281'  # Replace with your actual PIN
```

### 1. Login First
Get an authenticated session cookie:
```powershell
curl -i -X POST http://127.0.0.1:8000/auth/login `
  -H "Content-Type: application/json" `
  -H "X-CSRF-Token: 1" `
  -d '{"email":"leoklemet.pa@gmail.com","password":"YourPassword"}'
```

Extract the `access_token` cookie from the response and use it in subsequent requests.

### 2. Unlock Dev Tools (expects 200 + Set-Cookie dev_unlocked)
```powershell
curl -i -X POST http://127.0.0.1:8000/auth/dev/unlock `
  -H "X-CSRF-Token: 1" `
  -F "pin=$env:DEV_SUPERUSER_PIN" `
  --cookie "access_token=YOUR_ACCESS_TOKEN"
```

**Expected response:**
- Status: `200 OK`
- Header: `Set-Cookie: dev_unlocked=1; Path=/; HttpOnly; SameSite=lax; Max-Age=28800`
- Body: `{"ok": true, "message": "Dev mode unlocked", "dev_unlocked": true, "email": "..."}`

**Logs to check:**
```
✅ SECURITY: Dev unlock SUCCESS | user_id=123 email=leoklemet.pa@gmail.com throttle_cleared=true
✅ SECURITY: Dev mode UNLOCKED | user_id=123 email=leoklemet.pa@gmail.com
```

### 3. Verify Unlock Status
```powershell
curl -i http://127.0.0.1:8000/auth/me `
  --cookie "access_token=YOUR_ACCESS_TOKEN;dev_unlocked=1"
```

**Expected response:**
```json
{
  "email": "leoklemet.pa@gmail.com",
  "roles": ["admin"],
  "is_active": true,
  "dev_unlocked": true,
  "unlock_persist": "cookie",  // or "session" if session middleware active
  "env": "dev"
}
```

### 4. Use a Dev Tool (expects 200)
```powershell
curl -i -X POST http://127.0.0.1:8000/agent/tools/rag/seed `
  -H "X-CSRF-Token: 1" `
  --cookie "access_token=YOUR_ACCESS_TOKEN;dev_unlocked=1"
```

**Expected response:**
- Status: `200 OK`
- Tool executes successfully (admin-only RAG tools accessible)

### 5. Lock Back (expects 200 + cookie deletion)
```powershell
curl -i -X POST http://127.0.0.1:8000/auth/dev/lock `
  -H "X-CSRF-Token: 1" `
  --cookie "access_token=YOUR_ACCESS_TOKEN;dev_unlocked=1"
```

**Expected response:**
- Status: `200 OK`
- Header: `Set-Cookie: dev_unlocked=; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
- Body: `{"ok": true, "dev_unlocked": false}`

**Logs to check:**
```
🔒 SECURITY: Dev mode LOCKED | user_id=123 email=leoklemet.pa@gmail.com
```

### 6. Test Bruteforce Protection

Try incorrect PIN multiple times:
```powershell
# Attempt 1-5 with wrong PIN
for ($i=1; $i -le 6; $i++) {
    Write-Host "`nAttempt $i with wrong PIN..."
    curl -i -X POST http://127.0.0.1:8000/auth/dev/unlock `
      -H "X-CSRF-Token: 1" `
      -F "pin=000000" `
      --cookie "access_token=YOUR_ACCESS_TOKEN"
}
```

**Expected behavior:**
- Attempts 1-5: `403 Forbidden` with `{"detail": "Invalid PIN"}`
- Attempt 6+: `429 Too Many Requests` with `{"detail": "Too many failed attempts. Try again in 300 seconds."}`

**Logs to check:**
```
🚫 SECURITY: Dev unlock failed | user_id=123 email=leoklemet.pa@gmail.com reason=invalid_pin attempts=5/5
🚫 SECURITY: Dev unlock LOCKED OUT | user_id=123 email=leoklemet.pa@gmail.com lockout_duration=300s
🚫 SECURITY: Dev unlock rate-limited | user_id=123 email=leoklemet.pa@gmail.com lockout_remaining=298s attempts=0
```

### 7. Test Persistence Across Requests

After unlocking, make multiple requests without re-unlocking:
```powershell
# First request after unlock
curl -i http://127.0.0.1:8000/auth/me --cookie "access_token=YOUR_ACCESS_TOKEN;dev_unlocked=1"

# Second request (should still work)
curl -i http://127.0.0.1:8000/auth/me --cookie "access_token=YOUR_ACCESS_TOKEN;dev_unlocked=1"

# Third request after simulating page reload (cookie persists)
curl -i http://127.0.0.1:8000/auth/me --cookie "access_token=YOUR_ACCESS_TOKEN;dev_unlocked=1"
```

All should return `"dev_unlocked": true`.

## PROD Mode Testing (Guard Tests)

Set up prod environment:
```powershell
$env:APP_ENV='prod'
$env:ALLOW_DEV_ROUTES='0'
Remove-Item Env:\DEV_SUPERUSER_EMAIL -ErrorAction SilentlyContinue
Remove-Item Env:\DEV_SUPERUSER_PIN -ErrorAction SilentlyContinue
```

### 1. Unlock Endpoint Should Fail (expect 403)
```powershell
curl -s -o $null -w "%{http_code}\n" `
  -X POST http://127.0.0.1:8000/auth/dev/unlock `
  -H "X-CSRF-Token: 1" `
  -F "pin=whatever"
```

**Expected:** `403` (Forbidden - dev unlock not available in production)

### 2. Dev Tools Should Fail Without Unlock (expect 403)
```powershell
curl -s -o $null -w "%{http_code}\n" `
  -X POST http://127.0.0.1:8000/agent/tools/rag/seed `
  -H "X-CSRF-Token: 1" `
  --cookie "access_token=YOUR_ACCESS_TOKEN"
```

**Expected:** `403` (Forbidden - admin required)

### 3. Dev Cookie Should Be Ignored in Prod
Even if a `dev_unlocked` cookie exists, it should be completely ignored:
```powershell
curl -i http://127.0.0.1:8000/auth/me `
  --cookie "access_token=YOUR_ACCESS_TOKEN;dev_unlocked=1"
```

**Expected response:**
```json
{
  "email": "user@example.com",
  "roles": ["user"],
  "dev_unlocked": false,  // Always false in prod
  "unlock_persist": null,
  "env": "prod"
}
```

### 4. Lock Endpoint Should Fail (expect 403)
```powershell
curl -s -o $null -w "%{http_code}\n" `
  -X POST http://127.0.0.1:8000/auth/dev/lock `
  -H "X-CSRF-Token: 1" `
  --cookie "access_token=YOUR_ACCESS_TOKEN;dev_unlocked=1"
```

**Expected:** `403` (Forbidden - not available in prod)

## Troubleshooting

### Cookie Not Persisting
- Check that `path="/"` is set in the cookie
- Verify `Max-Age=28800` (8 hours)
- Check browser DevTools → Application → Cookies

### Unlock Not Working After Page Reload
1. Check `/auth/me` for `unlock_persist` field:
   - `"session"` = session storage (preferred)
   - `"cookie"` = cookie fallback
   - `null` = not persisted
2. Verify session middleware is configured (Starlette SessionMiddleware)
3. Check browser has cookies enabled

### Rate Limit Not Clearing
- Wait the full 5 minutes (300 seconds)
- Or restart backend (in-memory state clears)
- Check logs for `throttle_cleared=true`

### Logs Not Appearing
- Check `LOG_LEVEL` environment variable (should be `INFO` or `DEBUG`)
- Tail backend logs: `Get-Content -Path backend.log -Wait -Tail 20`

## Security Checklist

✅ Dev mode (APP_ENV=dev):
- [ ] Unlock works with correct PIN
- [ ] Invalid PIN triggers throttle
- [ ] 5 failed attempts → 5-minute lockout
- [ ] Successful unlock clears throttle
- [ ] Logout clears unlock state
- [ ] Manual lock works
- [ ] Unlock persists across page reload (cookie)
- [ ] Session persistence works if middleware enabled

✅ Prod mode (APP_ENV=prod):
- [ ] Unlock endpoint returns 403
- [ ] Lock endpoint returns 403
- [ ] Dev cookie completely ignored
- [ ] Dev tools require actual admin role
- [ ] No dev unlock in /auth/me response
- [ ] Startup warning logs if DEV_SUPERUSER_* set

## Automated Testing

Run E2E tests:
```powershell
# Dev unlock flow tests
cd apps/web
pnpm exec playwright test tests/e2e/dev-unlock.spec.ts

# Edge case tests (token rotation, multi-tab)
pnpm exec playwright test tests/e2e/dev-unlock-edges.spec.ts

# Prod guard tests
pnpm exec playwright test tests/e2e/dev-unlock-prod.spec.ts
```

Run backend unit tests:
```powershell
cd apps/backend
pytest tests/test_dev_unlock_prod_guard.py -v
pytest tests/test_agent_rag_tools.py -v
pytest tests/test_dev_unlock_security.py -v

# Quick security validation (fast, deterministic)
pytest -q tests/test_dev_unlock_security.py
```

**Security Test Coverage:**
- ✅ CSRF protection enforcement
- ✅ PIN bruteforce throttling with lockout reset
- ✅ Production cookie bypass prevention
- ✅ Lock endpoint cookie clearing with `Path=/`

## CI/CD

GitHub Actions workflow runs both dev and prod tests:
- `.github/workflows/e2e-dev-unlock.yml`
- Matrix strategy: `[dev, prod]`
- Dev: runs `dev-unlock.spec.ts` + `dev-unlock-edges.spec.ts`
- Prod: runs `dev-unlock-prod.spec.ts`

### Edge Case Tests Coverage

`dev-unlock-edges.spec.ts` validates:
- ✅ **Token Rotation:** `/auth/refresh` preserves unlock state across token refresh
- ✅ **Multi-Tab Locking:** Lock in Tab A → Tab B loses dev tools after reload
- ✅ **Shared Session State:** Multiple browser tabs share unlock/lock state correctly
