# Production Deployment - Avatar Backend + OAuth Update

**Date:** November 6, 2025
**Branch:** `ml-pipeline-2.1`
**Changes:** Backend avatar initial + Google OAuth photo integration

---

## 📋 Pre-Deployment Checklist

### 1. Code Review ✅
- [x] Backend `/auth/me` returns `id`, `initial`, `picture_url`
- [x] Frontend `getUserInitial()` prefers server initial
- [x] Google OAuth callback saves `name` and `picture`
- [x] CSP updated to allow Google image hosts
- [x] 22/22 unit tests passing
- [x] TypeScript compilation clean

### 2. Local Testing ✅
```powershell
# Backend tests
cd apps/backend
python -m pytest tests/test_auth.py -v

# Frontend tests
cd apps/web
pnpm test auth.spec.ts
pnpm run typecheck
```

### 3. Git Status
```powershell
# Ensure all changes committed
git status
git log --oneline -5

# Current branch
git branch --show-current
# Expected: ml-pipeline-2.1
```

---

## 🚀 Deployment Steps

### Step 1: Build Frontend Assets

```powershell
cd c:\ai-finance-agent-oss-clean\apps\web

# Install dependencies (if needed)
pnpm install

# Build production bundle
pnpm run build

# Verify build output
ls dist/
# Expected: index.html, assets/, favicon, etc.
```

**Validation:**
- ✅ `dist/index.html` exists
- ✅ `dist/assets/` contains JS/CSS bundles
- ✅ No build errors

---

### Step 2: Deploy Backend

```powershell
# Navigate to repo root
cd c:\ai-finance-agent-oss-clean

# Pull latest changes on remote server
docker --context desktop-linux compose -f ops/docker-compose.prod.yml down backend

# Rebuild backend image with new code
docker --context desktop-linux compose -f ops/docker-compose.prod.yml build backend

# Start backend
docker --context desktop-linux compose -f ops/docker-compose.prod.yml up -d backend

# Check logs
docker --context desktop-linux compose -f ops/docker-compose.prod.yml logs --tail=50 -f backend
```

**Watch for:**
- ✅ `"Application startup complete"`
- ✅ No import errors
- ❌ No `500 Internal Server Error` on `/auth/me`

---

### Step 3: Update Nginx Configuration

```powershell
# Nginx CSP update already in ops/nginx/conf.d/app.conf
# Copy new config to container

# Restart nginx to pick up CSP changes
docker --context desktop-linux compose -f ops/docker-compose.prod.yml restart nginx

# Verify nginx is running
docker --context desktop-linux compose -f ops/docker-compose.prod.yml ps nginx

# Check nginx logs for errors
docker --context desktop-linux compose -f ops/docker-compose.prod.yml logs --tail=20 nginx
```

**Validation:**
```powershell
# Test nginx config syntax
docker --context desktop-linux compose -f ops/docker-compose.prod.yml exec nginx nginx -t
# Expected: "syntax is ok", "test is successful"
```

---

### Step 4: Deploy Frontend

```powershell
# Copy dist/ to nginx webroot (adjust path for your setup)
# Option A: Direct copy (if nginx volume is accessible)
docker --context desktop-linux cp apps/web/dist/. <nginx-container>:/usr/share/nginx/html/

# Option B: Volume mount (if configured in docker-compose)
# The volume should already be mounted; just restart nginx
docker --context desktop-linux compose -f ops/docker-compose.prod.yml restart nginx
```

**Alternative (if using separate web server):**
```powershell
# If you have a separate static file server
# Copy dist/ to that server's webroot
scp -r apps/web/dist/* user@server:/var/www/ledger-mind/
```

---

### Step 5: Verify `/auth/me` Endpoint

```powershell
# Test /auth/me with curl (requires valid JWT token)
$TOKEN = "YOUR_JWT_TOKEN_HERE"
curl -H "Authorization: Bearer $TOKEN" https://ledger-mind.org/auth/me

# Expected response:
{
  "id": "123",
  "email": "user@example.com",
  "name": "User Name",
  "initial": "U",
  "picture_url": null,
  "roles": ["user"],
  ...
}
```

**Validation:**
- ✅ Response includes `id` field
- ✅ Response includes `initial` field (uppercase letter)
- ✅ Response includes `picture_url` field (null initially)
- ✅ No 500 errors

---

### Step 6: Test Google OAuth Flow

```powershell
# Open browser to production site
start https://ledger-mind.org

# Test OAuth login flow:
# 1. Click "Login with Google"
# 2. Select Google account
# 3. Authorize app
# 4. Verify redirect to app with avatar showing initial

# Check backend logs for OAuth success
docker --context desktop-linux compose -f ops/docker-compose.prod.yml logs --tail=20 backend | Select-String "OAuth"
```

**Expected Log Entries:**
```
OAuth login: set state + pkce in session
OAuth token OK; fetching userinfo
Created new user: user@example.com  (or "Updated user profile")
OAuth success for user@example.com
```

---

### Step 7: Verify Google Photo Display

```powershell
# After OAuth login, check user profile in database
docker --context desktop-linux compose -f ops/docker-compose.prod.yml exec backend python -c "
from app.db import SessionLocal
from app.orm_models import User

db = SessionLocal()
user = db.query(User).filter(User.email == 'YOUR_EMAIL').first()
print(f'Name: {user.name}')
print(f'Picture: {user.picture}')
print(f'Picture URL: {user.picture}')  # Same field
db.close()
"
```

**Expected:**
- ✅ `picture` field contains Google photo URL (e.g., `https://lh3.googleusercontent.com/...`)
- ✅ `/auth/me` returns this URL in `picture_url` field

---

### Step 8: Test CSP for Google Images

```powershell
# Open browser DevTools (F12)
# Navigate to app
start https://ledger-mind.org

# Check Console for CSP violations
# Filter by "Content-Security-Policy"
```

**Validation:**
- ✅ No CSP errors for Google image hosts
- ✅ Avatar images load successfully
- ❌ No "Refused to load the image" errors

---

### Step 9: Smoke Test All Features

```powershell
# Test checklist:
# 1. ✅ Login via Google OAuth works
# 2. ✅ Avatar shows initial immediately (no flicker)
# 3. ✅ Chat messages show user avatar
# 4. ✅ Header avatar matches chat avatar
# 5. ✅ Google photo loads in avatar (if set)
# 6. ✅ Fallback initial shows if photo blocked
# 7. ✅ Month summary works
# 8. ✅ Export JSON/Markdown works
# 9. ✅ No console errors
# 10. ✅ Auth /me returns correct fields
```

---

### Step 10: Monitor Logs

```powershell
# Watch logs for 5-10 minutes after deployment
docker --context desktop-linux compose -f ops/docker-compose.prod.yml logs -f backend nginx

# Monitor for:
# - No 500 errors
# - No OAuth failures
# - No CSP violations
# - Normal traffic patterns
```

**Stop monitoring:** `Ctrl+C`

---

## 🔄 Rollback Plan

If issues occur:

### Quick Rollback (Backend)
```powershell
# Rollback to previous backend image
docker --context desktop-linux compose -f ops/docker-compose.prod.yml down backend
docker --context desktop-linux pull <previous-backend-image>
docker --context desktop-linux compose -f ops/docker-compose.prod.yml up -d backend
```

### Quick Rollback (Frontend)
```powershell
# Restore previous dist/ folder
docker --context desktop-linux cp <backup-dist>. <nginx-container>:/usr/share/nginx/html/
docker --context desktop-linux compose -f ops/docker-compose.prod.yml restart nginx
```

### Quick Rollback (Nginx CSP)
```powershell
# Revert CSP changes in ops/nginx/conf.d/app.conf
git checkout HEAD~1 -- ops/nginx/conf.d/app.conf

# Copy to container and reload
docker --context desktop-linux cp ops/nginx/conf.d/app.conf <nginx-container>:/etc/nginx/conf.d/
docker --context desktop-linux compose -f ops/docker-compose.prod.yml exec nginx nginx -s reload
```

---

## 📊 Post-Deployment Validation

### 1. Check Metrics

```powershell
# Check Cloudflare Tunnel health
curl http://127.0.0.1:2000/metrics | Select-String "cloudflared_tunnel"

# Expected: cloudflared_tunnel_ha_connections 4
```

### 2. Check Error Rates

```powershell
# Backend error logs (last hour)
docker --context desktop-linux compose -f ops/docker-compose.prod.yml logs --since 1h backend | Select-String "ERROR|CRITICAL"

# Expected: No new errors related to auth/avatar
```

### 3. Test from Different Locations

```powershell
# Test from external network (not your dev machine)
# Ask a colleague or use mobile device

start https://ledger-mind.org
# Verify avatar works
```

---

## 🐛 Troubleshooting

### Issue: Avatar shows "?" instead of initial

**Diagnosis:**
```powershell
# Check /auth/me response
curl -H "Authorization: Bearer $TOKEN" https://ledger-mind.org/auth/me | jq '.initial'
```

**Fix:**
- If `null`: Backend not computing initial → Check backend logs
- If `"?"`: User has no name/email → Check database

---

### Issue: Google photo not loading

**Diagnosis:**
```powershell
# Check CSP in browser DevTools
# Look for "Refused to load the image" errors
```

**Fix:**
1. Verify CSP includes Google hosts:
   ```powershell
   docker --context desktop-linux compose -f ops/docker-compose.prod.yml exec nginx cat /etc/nginx/conf.d/app.conf | Select-String "img-src"
   ```
2. Expected: `img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com;`
3. If missing, re-deploy nginx config

---

### Issue: OAuth callback fails

**Diagnosis:**
```powershell
# Check backend logs for OAuth errors
docker --context desktop-linux compose -f ops/docker-compose.prod.yml logs backend | Select-String "OAuth"
```

**Common Issues:**
- `OAuth state mismatch`: Session cookie issue → Check HTTPS/secure cookies
- `OAuth token exchange failed`: Wrong CLIENT_ID/SECRET → Check env vars
- `No email from OAuth provider`: Google account has no email → Check scope

---

## 📝 Environment Variables

Ensure these are set in production:

```bash
# Google OAuth (required)
OAUTH_GOOGLE_CLIENT_ID=<your-google-client-id>
OAUTH_GOOGLE_CLIENT_SECRET=<your-google-client-secret>
OAUTH_REDIRECT_URL=https://ledger-mind.org/auth/google/callback

# JWT Keys (required)
JWT_SECRET_KEY=<your-secret-key>
JWT_ACCESS_EXP_MINUTES=60
JWT_REFRESH_EXP_DAYS=7

# App Environment
APP_ENV=prod
DATABASE_URL=postgresql://...
```

**Verify:**
```powershell
docker --context desktop-linux compose -f ops/docker-compose.prod.yml exec backend env | Select-String "OAUTH"
```

---

## ✅ Deployment Complete

Once all steps pass:

1. ✅ Backend deployed with new `/auth/me` fields
2. ✅ Frontend updated with server-provided initial
3. ✅ Nginx CSP allows Google images
4. ✅ Google OAuth saves user photos
5. ✅ All tests passing
6. ✅ No errors in logs
7. ✅ Avatar shows immediately (no flicker)

---

## 📚 References

- **Backend Changes**: `docs/BACKEND_USER_AVATARS_SUMMARY.md`
- **Commit Guide**: `docs/COMMIT_GUIDE_BACKEND_AVATARS.md`
- **OAuth Implementation**: `apps/backend/app/auth/google.py`
- **CSP Config**: `ops/nginx/conf.d/app.conf`

---

## 🎉 Success Criteria

- [ ] `/auth/me` returns `id`, `initial`, `picture_url`
- [ ] Avatar shows initial immediately on page load
- [ ] Google OAuth saves user name and photo
- [ ] Google photos load without CSP errors
- [ ] No "?" → "L" flicker
- [ ] All existing features work
- [ ] No errors in production logs
- [ ] Rollback plan documented and tested

**Deployment Time:** ~30 minutes
**Downtime:** ~0 minutes (rolling restart)
