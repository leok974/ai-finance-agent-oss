# CSP Validation Runbook
# Quick commands to validate CSP deployment and prevent regressions

## 1. Rebuild and restart nginx
```powershell
docker compose -f docker-compose.prod.yml build nginx
docker compose -f docker-compose.prod.yml up -d nginx
```

## 2. Check nginx logs for validation
```powershell
docker compose -f docker-compose.prod.yml logs nginx --tail=30 | Select-String "csp|CSP"
```

## 3. Verify local origin header (no Cloudflare)
```powershell
curl.exe -sSI http://127.0.0.1/ | findstr /I "Content-Security-Policy"
```

Expected: `Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-...'`

## 4. Purge Cloudflare cache
```powershell
# Replace with your actual credentials
.\scripts\purge-cf-quick.ps1 -ZoneId "YOUR_ZONE_ID" -ApiToken "YOUR_API_TOKEN"
```

## 5. Verify edge header + cache status
```powershell
curl.exe -sSI https://app.ledger-mind.org/ | findstr /I "CF-Cache-Status Content-Security-Policy"
```

Expected:
- `Content-Security-Policy:` with actual hash (NOT `__INLINE_SCRIPT_HASHES__`)
- `CF-Cache-Status: DYNAMIC` or `MISS` (first request after purge)

## 6. Emergency: Check for placeholder in active config
```powershell
docker compose -f docker-compose.prod.yml exec nginx sh -c "nginx -T 2>&1 | grep -n '__INLINE_SCRIPT_HASHES__'"
```

Expected: No output (exit code 1 means not found, which is good)

## 7. Dump all CSP lines from active config
```powershell
docker compose -f docker-compose.prod.yml exec nginx sh -c "nginx -T 2>&1 | grep -n 'Content-Security-Policy'"
```

Review output—should only show runtime-generated CSP with actual hash.

## Validation Checklist
- [ ] Nginx logs show: `[csp] ✓ CSP runtime config validated`
- [ ] Nginx logs show: `[nginx] ✓ CSP sanity check passed`
- [ ] Local curl shows CSP with sha256 hash
- [ ] Edge curl shows CSP with sha256 hash (after purge)
- [ ] Browser console: NO CSP violations for inline scripts
- [ ] Browser console: NO `__INLINE_SCRIPT_HASHES__` errors

## Common Issues

### Placeholder still in active config
**Symptom:** Browser shows `invalid source: '__INLINE_SCRIPT_HASHES__'`
**Fix:** Entrypoint validation should catch this. Check if runtime include path is correct.

### CSP header missing entirely
**Symptom:** No CSP header in curl output
**Fix:** Check nginx `add_header` inheritance—ensure runtime include is in each HTML-serving location block.

### Multiple CSP headers
**Symptom:** Browser merges multiple CSP directives
**Fix:** Remove duplicate `add_header Content-Security-Policy` from location blocks. Only use runtime include.

### Cloudflare serving old header
**Symptom:** Edge shows placeholder, but local shows hash
**Fix:** Purge cache. If persistent, check Cache Rules or enable Development Mode temporarily.
