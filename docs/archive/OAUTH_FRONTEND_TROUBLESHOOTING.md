# OAuth Frontend Deployment - Troubleshooting Guide

## Quick Verification Checklist

### 1. Check Browser (Visual Test)
```bash
# Open the app
Start-Process 'https://app.ledger-mind.org'
```

**Expected behavior:**
- ✅ If NOT logged in: See "Sign in with Google" button (no email/password fields)
- ✅ If logged in: See user avatar + name + "Logout" button
- ❌ Should NOT see: email fields, "Register", "Forgot?", "admin@local"

### 2. Check Browser Console (F12)
Open browser DevTools (F12) and check the Console tab:

```javascript
// Check environment variables are set correctly
console.log('VITE_ENABLE_LOCAL_AUTH:', import.meta.env.VITE_ENABLE_LOCAL_AUTH);
console.log('VITE_ENABLE_GOOGLE_OAUTH:', import.meta.env.VITE_ENABLE_GOOGLE_OAUTH);
console.log('VITE_API_BASE:', import.meta.env.VITE_API_BASE);
console.log('PROD:', import.meta.env.PROD);
```

**Expected output:**
```
VITE_ENABLE_LOCAL_AUTH: "0"
VITE_ENABLE_GOOGLE_OAUTH: "1"
VITE_API_BASE: ""
PROD: true
```

### 3. Test OAuth Button Click
```bash
# Click "Sign in with Google" and verify redirect
# Should go to: https://accounts.google.com/...
```

### 4. Check Network Tab (F12 → Network)
After clicking the button:
- Request to: `/api/auth/google/login`
- Response: 302 redirect to Google
- Final redirect: Back to your app after authentication

## Common Issues & Fixes

### Issue 1: Old local auth form still showing

**Cause:** Browser cache or App.tsx still using AccountMenu

**Fix:**
```powershell
# 1. Clear browser cache (Ctrl+Shift+Delete)
# 2. Hard refresh (Ctrl+Shift+R)
# 3. Or rebuild with no cache:
docker compose -f docker-compose.prod.yml build --no-cache nginx
docker compose -f docker-compose.prod.yml up -d nginx
```

**Verify App.tsx:**
```tsx
// Should have ONLY this in header:
<AuthMenu />

// Should NOT have:
<AccountMenu ... />  // ❌ Remove this
```

### Issue 2: Google button not visible

**Cause:** Environment variables not set during build

**Fix:**
```powershell
# Verify docker-compose.prod.yml has:
# VITE_ENABLE_LOCAL_AUTH: "0"
# VITE_ENABLE_GOOGLE_OAUTH: "1"

# Rebuild with flags:
docker compose -f docker-compose.prod.yml build --no-cache nginx
docker compose -f docker-compose.prod.yml up -d nginx
```

**Verify AuthMenu.tsx:**
```tsx
// Should convert env vars to strings:
const enableGoogle = String(import.meta.env.VITE_ENABLE_GOOGLE_OAUTH ?? "1") === "1";
```

### Issue 3: Button clicks but nothing happens

**Cause:** authClient.ts not using correct API path

**Fix:**
```typescript
// apps/web/src/lib/authClient.ts should have:
const API_BASE = import.meta.env.VITE_API_BASE || "";
const API = API_BASE ? API_BASE.replace(/\/$/, "") : "";

export function loginWithGoogle() {
  window.location.href = `${API}/api/auth/google/login`;  // ✅ Correct
}
```

**Test manually:**
```powershell
# Should return 302 redirect
Invoke-WebRequest 'https://app.ledger-mind.org/api/auth/google/login' -MaximumRedirection 0
```

### Issue 4: OAuth flow fails after Google redirect

**Cause:** Backend session or redirect URI misconfigured

**Fix:**
```bash
# Check backend logs
docker logs ai-finance-agent-oss-clean-backend-1 --tail 50 | Select-String "OAuth"

# Verify backend.env has:
OAUTH_REDIRECT_URL=https://app.ledger-mind.org/api/auth/google/callback
SESSION_SECRET=<your-secret>
COOKIE_SECURE=1
COOKIE_DOMAIN=app.ledger-mind.org
```

### Issue 5: "Loading..." forever or blank page

**Cause:** AuthMenu can't fetch `/api/auth/me`

**Fix:**
```powershell
# Test auth/me endpoint
Invoke-RestMethod 'https://app.ledger-mind.org/api/auth/me'
# Should return: {"ok":true,"user":{...}} OR 401 if not logged in
```

**Check AuthMenu.tsx:**
```tsx
// Should fetch /api/auth/me (with /api prefix)
fetch("/api/auth/me", { credentials: "include" })
```

## Force Clean Rebuild

If all else fails, force a complete rebuild:

```powershell
# 1. Stop everything
docker compose -f docker-compose.prod.yml down

# 2. Remove nginx image
docker rmi ai-finance-agent-oss-clean-nginx:latest

# 3. Clear Docker build cache
docker builder prune -af

# 4. Rebuild from scratch
docker compose -f docker-compose.prod.yml build --no-cache nginx

# 5. Deploy
docker compose -f docker-compose.prod.yml up -d

# 6. Wait for health checks
Start-Sleep -Seconds 20

# 7. Open browser and test
Start-Process 'https://app.ledger-mind.org'
```

## Verify Production Build Args

Check what was actually built into the image:

```powershell
# Inspect the built image
docker inspect ai-finance-agent-oss-clean-nginx:latest | ConvertFrom-Json |
  Select-Object -ExpandProperty Config |
  Select-Object -ExpandProperty Env
```

Should see environment variables including VITE_* vars.

## Check Built Assets

Verify the built JavaScript has the correct values:

```powershell
# Extract and check the built JS
docker run --rm ai-finance-agent-oss-clean-nginx:latest cat /usr/share/nginx/html/assets/*.js |
  Select-String -Pattern "VITE_ENABLE_GOOGLE_OAUTH|VITE_ENABLE_LOCAL_AUTH"
```

## Success Criteria

✅ **Before Login:**
- Google OAuth button visible
- No local auth form visible
- Clicking button redirects to `accounts.google.com`

✅ **After Login:**
- User avatar displayed
- User name/email displayed
- Logout button visible and functional

✅ **Network:**
- `/api/auth/google/login` → 302 to Google
- Google callback to `/api/auth/google/callback` → 302 to `/`
- `/api/auth/me` → 200 with user data

✅ **Console:**
- No errors
- Environment variables correct
- `PROD: true`

## Still Having Issues?

1. Check browser console for JavaScript errors
2. Check Network tab for failed requests
3. Check backend logs for OAuth errors
4. Verify Google Cloud Console has correct redirect URI
5. Clear all caches and cookies
6. Try incognito mode

## Get Help

If the checklist doesn't resolve your issue:
1. Open browser DevTools (F12)
2. Take screenshots of Console and Network tabs
3. Share backend logs: `docker logs ai-finance-agent-oss-clean-backend-1 --tail 100`
4. Share frontend env check output (console.log commands above)
