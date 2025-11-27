# Debugging 401 Unauthorized Errors on Upload/Reset

## Problem

User reports 401 errors when using main account features:
- `POST /ingest/dashboard/reset` → 401
- `POST /demo/seed` → 401

Demo page works fine, but main account page fails.

## Root Cause Analysis

Both endpoints require authentication:

1. **`/demo/seed`** - Requires `current_user` (backend: `Depends(get_current_user)`)
2. **`/ingest/dashboard/reset`** - Requires `user_id` (backend: `Depends(get_current_user_id)`) + CSRF token

### Possible Causes

#### 1. **Session Expired**
- httpOnly cookies (`access_token_cookie`, `refresh_token_cookie`) expired
- Backend returns 401 when trying to extract user from expired JWT

**Check:**
```javascript
// In browser console (app.ledger-mind.org)
document.cookie
// Should see: access_token_cookie=...; refresh_token_cookie=...
```

**Fix:**
- Logout and login again
- Or trigger refresh: `POST /api/auth/refresh`

#### 2. **Cookies Not Being Sent**
- SameSite restrictions blocking cookies
- Domain mismatch (cookies set for wrong domain)

**Check:**
```javascript
// DevTools → Application → Cookies
// Verify cookies exist for app.ledger-mind.org
```

**Fix:**
- Ensure `credentials: 'include'` in fetch (already present in `http.ts`)
- Check cookie domain is `.ledger-mind.org` or `app.ledger-mind.org`

#### 3. **CSRF Token Missing**
- `/ingest/dashboard/reset` requires `X-CSRF-Token` header
- Token extracted from `csrf_token` cookie

**Check:**
```javascript
// In browser console
document.cookie.match(/csrf_token=([^;]+)/)
// Should return token value
```

**Fix:**
- Already handled in `http.ts` (see `getCsrfTokenFromCookie()`)
- If missing, backend needs to set `csrf_token` cookie on login

#### 4. **Mixed Demo/Main Session**
- User logged in with demo account trying to access main features
- Or vice versa

**Check:**
```javascript
// In React DevTools or browser console
// Find AuthContext or check /api/auth/me response
fetch('/api/auth/me', {credentials: 'include'}).then(r => r.json())
// Check: is_demo field
```

**Fix:**
- Logout from demo account
- Login with real Google OAuth account

## Diagnostic Steps

### Step 1: Check Current Session
```bash
# In browser console
fetch('/api/auth/me', {credentials: 'include'})
  .then(r => r.json())
  .then(console.log)
```

Expected response:
```json
{
  "id": "123",
  "email": "user@example.com",
  "is_demo": false,
  "roles": ["user"]
}
```

If 401: Session expired or not authenticated

### Step 2: Check Cookies
```bash
# DevTools → Application → Cookies → app.ledger-mind.org
```

Required cookies:
- `access_token_cookie` (httpOnly)
- `refresh_token_cookie` (httpOnly)
- `csrf_token` (accessible to JS)

### Step 3: Manual Refresh
```bash
# In browser console
fetch('/api/auth/refresh', {
  method: 'POST',
  credentials: 'include',
  headers: {'Content-Type': 'application/json'}
}).then(r => r.json())
```

If successful, retry the original request

### Step 4: Check Request Headers
```bash
# DevTools → Network → Select failing request
# Check Request Headers:
```

Required:
- `Cookie: access_token_cookie=...; csrf_token=...`
- `X-CSRF-Token: <value from csrf_token cookie>`

## Quick Fixes

### Fix 1: Force Re-login
```javascript
// Clear session and redirect to login
window.location.href = '/api/auth/google/logout';
```

### Fix 2: Manual Session Refresh
```javascript
// Trigger refresh in auth context
const { refresh } = useAuth();
await refresh();
```

### Fix 3: Check Demo Mode
```javascript
// Verify you're not in demo mode
const { user } = useAuth();
console.log('is_demo:', user?.is_demo);
// If true, logout and use real account
```

## Code Locations

- **Frontend HTTP client**: `apps/web/src/lib/http.ts` (handles CSRF, credentials)
- **Auth context**: `apps/web/src/state/auth.tsx` (manages user session)
- **Upload component**: `apps/web/src/components/UploadCsv.tsx` (calls failing endpoints)
- **Backend demo seed**: `apps/backend/app/routers/demo_seed.py` (requires auth)
- **Backend dashboard reset**: `apps/backend/app/routers/ingest.py` (requires auth + CSRF)

## Temporary Workaround

If session keeps expiring, increase JWT expiry in backend:

```python
# apps/backend/app/config.py
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours instead of default
REFRESH_TOKEN_EXPIRE_DAYS = 30  # 30 days
```

## Permanent Fix

Implement automatic session refresh in frontend:

```typescript
// In apps/web/src/lib/http.ts
if (r.status === 401) {
  // Try refresh once
  await fetch('/api/auth/refresh', {method: 'POST', credentials: 'include'});
  // Retry original request
  return fetch(url, {...opts, credentials: 'include'});
}
```
