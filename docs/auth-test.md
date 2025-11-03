# Auth Flow Test Script (auth-test.ps1)

This script performs an end-to-end cookie-based authentication validation against a running backend instance.

## What It Verifies
1. (Optional) Registration of a user (POST /auth/register)
2. Login (POST /auth/login) — expects access + refresh + csrf cookies
3. Auth status canary (GET /auth/status) — should return `{ ok: true }`
4. Refresh (POST /auth/refresh) — requires matching `X-CSRF-Token` header
5. Logout (POST /auth/logout) — clears auth cookies
6. Post-logout status (GET /auth/status) — should now fail (401)

## Invocation
```powershell
# Basic (randomized email to avoid collisions)
powershell -File scripts/auth-test.ps1 -BaseUrl https://your.domain

# Use static email (will append +random only if -StaticEmail is omitted)
powershell -File scripts/auth-test.ps1 -BaseUrl https://your.domain -Email probe@example.com -StaticEmail

# Force registration attempt (default is *not* to register unless -Register is set)
powershell -File scripts/auth-test.ps1 -BaseUrl https://your.domain -Register -Email newuser@example.com

# Write Prometheus metrics textfile
auth-test.ps1 -BaseUrl https://your.domain -MetricsPath ops/metrics/auth.prom
```

## Parameters (Key)
- `-BaseUrl` (default `https://localhost`)
- `-Email` (default `probe@example.com`)
- `-Password` (default test password; not secret)
- `-StaticEmail` — prevent random suffix (otherwise `+<rand>` added)
- `-Register` — attempt registration first
- `-MetricsPath` — write gauges (`auth_test_ok`, `auth_test_step_success{step="..."}`)
- `-Insecure` — adds `--ssl-no-revoke` (Windows revocation workaround)
- `-Quiet` — suppress info logs (JSON only)

## Exit Codes
| Code | Meaning |
|------|---------|
| 0 | All steps passed |
| 10 | Register failed (unexpected) |
| 20 | Login failed |
| 30 | Pre-status failed |
| 40 | Refresh failed |
| 50 | Logout failed |
| 60 | Post-logout status unexpectedly succeeded |
| 70 | Internal script error |

## JSON Output Structure
```json
{
  "base_url": "https://your.domain",
  "email": "probe@example.com",
  "register": { "success": true, "issued": true },
  "login": { "success": true, "access_token_present": true },
  "status_pre": { "success": true },
  "refresh": { "success": true },
  "logout": { "success": true },
  "status_post": { "success": true, "expected_unauthorized": true },
  "ok": true,
  "ts": "2025-09-30T12:34:56.0000000Z"
}
```

## Integration with edge-verify
`edge-verify.ps1` now supports an optional auth test phase:
```powershell
scripts/edge-verify.ps1 -HostName your.domain -AuthTest -AuthStaticEmail -AuthEmail probe@example.com
```
Adds an `auth` object to the JSON plus includes `auth` in `summary.critical` if the flow fails.

## Prometheus Metrics (if MetricsPath provided)
- `auth_test_ok` — 1 if the entire flow succeeded
- `auth_test_step_success{step="login"}` etc.

## Notes
- Uses plain string password parameter for simplicity; do not reuse production credentials.
- CSRF is automatically exercised via refresh + logout steps.
- Designed to be idempotent when `-StaticEmail` + existing user (registration skipped or reported as non-fatal failure).

## Future Enhancements
- Add optional bearer token echo of a protected endpoint
- Add OAuth callback simulation (when providers configured)
- Mask sensitive cookie values in verbose mode
