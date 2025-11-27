# Google OAuth Frontend Integration - Quick Reference

## Overview
The frontend now supports environment-based authentication provider toggles, allowing you to show/hide Google OAuth, GitHub OAuth, and local email/password authentication based on deployment environment.

## Files Created/Modified

### 1. **Auth Client** (`apps/web/src/lib/authClient.ts`)
Central location for OAuth actions:
```typescript
- loginWithGoogle() → redirects to /api/auth/google/login
- loginWithGitHub() → redirects to /api/auth/github/login
- logout() → redirects to /api/auth/google/logout
```

### 2. **Auth Menu** (`apps/web/src/components/AuthMenu.tsx`)
Smart component that shows different UI based on:
- **Production** (`import.meta.env.PROD`): Shows only OAuth buttons (hides local auth)
- **Development**: Shows OAuth + optional local auth forms
- **After login**: Shows user avatar, name, and logout button

### 3. **Environment Variables**

#### Development (`.env`)
```bash
VITE_ENABLE_LOCAL_AUTH=1      # Show local login forms
VITE_ENABLE_GOOGLE_OAUTH=1    # Show Google button
VITE_ENABLE_GITHUB_OAUTH=0    # Hide GitHub (not ready yet)
VITE_API_BASE=http://127.0.0.1:8000
```

#### Production (`.env.web.prod` + `docker-compose.prod.yml`)
```bash
VITE_ENABLE_LOCAL_AUTH=0      # Hide local auth in production
VITE_ENABLE_GOOGLE_OAUTH=1    # Show Google OAuth
VITE_ENABLE_GITHUB_OAUTH=0    # Hide GitHub until backend ready
VITE_API_BASE=/api            # Same-origin API calls
```

### 4. **Dockerfile** (`deploy/Dockerfile.nginx`)
Added OAuth ARGs and ENV variables to pass flags into Vite build:
```dockerfile
ARG VITE_ENABLE_LOCAL_AUTH=0
ARG VITE_ENABLE_GOOGLE_OAUTH=1
ARG VITE_ENABLE_GITHUB_OAUTH=0
```

### 5. **Playwright Test** (`apps/web/tests/auth-google.spec.ts`)
Smoke test to verify:
- Google button is visible
- Clicking redirects to `accounts.google.com`
- GitHub button is hidden when disabled

## Production Behavior

### Before Login
```
+----------------------------------+
|         LedgerMind               |
|  [Sign in with Google]           |  ← Only OAuth button visible
+----------------------------------+
```

### After Login
```
+----------------------------------+
|  LedgerMind     [🧑 Leo] [Logout] |  ← User avatar + logout
+----------------------------------+
```

## Development Behavior

Shows all enabled providers for testing:
```
+----------------------------------+
|  LedgerMind                      |
|  [Sign in with Google]           |
|  [Sign in with GitHub]           |  ← If enabled
|  (Dev: Local auth available)     |  ← Hint for devs
+----------------------------------+
```

## Testing

### Local Development
```bash
cd apps/web
pnpm dev
# Visit http://localhost:5173
# Click "Sign in with Google"
# Should redirect to http://127.0.0.1:8000/api/auth/google/login
```

### Playwright Test
```bash
cd apps/web
pnpm exec playwright test tests/auth-google.spec.ts
```

### Production Deployment
```bash
# Build with production flags (OAuth only, no local auth)
docker compose -f docker-compose.prod.yml build nginx

# Deploy
docker compose -f docker-compose.prod.yml up -d nginx

# Test
open https://app.ledger-mind.org
```

## OAuth Flow (End-to-End)

1. **User clicks** "Sign in with Google" on `https://app.ledger-mind.org`
2. **Frontend redirects** to `/api/auth/google/login`
3. **Nginx proxies** to backend `/auth/google/login`
4. **Backend redirects** to Google OAuth (`accounts.google.com`)
5. **User authenticates** with Google
6. **Google redirects** back to `/api/auth/google/callback`
7. **Backend processes** OAuth callback, creates session
8. **Backend redirects** to `/` (homepage)
9. **Frontend fetches** `/api/auth/me` to get user info
10. **AuthMenu shows** user avatar + name + logout button

## Session Management

- **Session cookie**: `lm_oauth_session` (HttpOnly, Secure, SameSite=lax)
- **Session endpoint**: `GET /api/auth/me` returns `{ ok: true, user: {...} }`
- **Logout**: `POST /api/auth/google/logout` clears session

## Enabling GitHub OAuth (Future)

When backend GitHub OAuth is ready:

1. Update production environment:
   ```bash
   VITE_ENABLE_GITHUB_OAUTH=1
   ```

2. Rebuild and deploy:
   ```bash
   docker compose -f docker-compose.prod.yml build nginx
   docker compose -f docker-compose.prod.yml up -d nginx
   ```

3. Users will see both Google and GitHub buttons

## Troubleshooting

### "Sign in with Google" button not visible
- Check `VITE_ENABLE_GOOGLE_OAUTH=1` in docker-compose build args
- Rebuild nginx: `docker compose -f docker-compose.prod.yml build nginx`

### Button redirects to wrong URL
- Check `VITE_API_BASE` environment variable
- Production should use `/api` (same-origin)
- Development can use `http://127.0.0.1:8000`

### Session not persisting
- Ensure `COOKIE_SECURE=1` in production backend environment
- Check `COOKIE_DOMAIN=app.ledger-mind.org` in docker-compose
- Verify SessionMiddleware has proper domain configuration

### User profile not showing after login
- Check `/api/auth/me` endpoint returns `{ ok: true, user: {...} }`
- Verify session cookie is being set with correct attributes
- Check browser console for fetch errors

## Security Notes

✅ **Production (HTTPS)**:
- Session cookies are `Secure` (HTTPS only)
- `HttpOnly` prevents XSS access
- `SameSite=lax` prevents CSRF
- Domain set to `app.ledger-mind.org`

⚠️ **Development (HTTP)**:
- Session cookies are NOT `Secure` (HTTP allowed)
- All other security attributes still apply
- Use `127.0.0.1` not `localhost` for consistent cookie behavior

## Summary

✅ **Complete**: Google OAuth frontend integration with environment-based toggles
✅ **Production-ready**: Clean OAuth-only interface, local auth hidden
✅ **Flexible**: Easy to enable GitHub OAuth or local auth per environment
✅ **Tested**: Playwright smoke tests for OAuth button and flow
✅ **Secure**: Proper session cookie configuration with HttpOnly, Secure, SameSite

**Next Steps**:
1. Test the OAuth flow at https://app.ledger-mind.org
2. (Optional) Implement GitHub OAuth backend when needed
3. (Optional) Add provider icons/badges for visual polish
