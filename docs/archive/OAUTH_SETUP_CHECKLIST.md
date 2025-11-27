# OAuth Setup Checklist - Google Sign-In

## Problem Fixed
The "OAuth state mismatch" error occurred because:
- The callback was hitting `127.0.0.1` while the app set the state cookie for `app.ledger-mind.org`
- Cookies are scoped by domain, so the callback couldn't see the right cookie → mismatch

## Code Changes Completed ✅

### 1. Updated OAuth Redirect URI (Default)
- **File**: `apps/backend/app/auth/google.py`
- **Changed**: Default `OAUTH_REDIRECT_URL` from `http://127.0.0.1:8000/api/auth/google/callback` to `https://app.ledger-mind.org/auth/google/callback`

### 2. Updated Environment Variables
- **File**: `docker-compose.yml`
- **Added**:
  ```yaml
  OAUTH_GOOGLE_CLIENT_ID: "${OAUTH_GOOGLE_CLIENT_ID}"
  OAUTH_GOOGLE_CLIENT_SECRET: "${OAUTH_GOOGLE_CLIENT_SECRET}"
  OAUTH_REDIRECT_URL: "https://app.ledger-mind.org/auth/google/callback"
  PUBLIC_ORIGIN: "https://app.ledger-mind.org"
  BACKEND_PUBLIC_URL: "https://app.ledger-mind.org"
  SESSION_SECRET: "${SESSION_SECRET:-dev-session-secret-change-me}"
  ```
- **Changed**: `COOKIE_SAMESITE` from `"lax"` to `"none"` (required for OAuth cross-site redirects)

### 3. Updated Session Middleware
- **File**: `apps/backend/app/main.py`
- **Changed**: `same_site="lax"` to `same_site="none"` for OAuth session cookie
- **Reason**: Required for cross-site redirects when Google redirects back to your app

### 4. Verified Nginx Proxy Headers ✅
- **File**: `nginx-simple.conf`
- **Confirmed Present**:
  ```nginx
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  ```

## Action Items Required 🔴

### 1. Set Environment Variables in `.env.prod.local`

You need to add these to your `.env.prod.local` file (create if doesn't exist):

```bash
# OAuth Configuration
SESSION_SECRET=<generate-strong-random-secret>
OAUTH_GOOGLE_CLIENT_ID=<your-google-client-id>.apps.googleusercontent.com
OAUTH_GOOGLE_CLIENT_SECRET=<your-google-client-secret>
```

**To generate a strong SESSION_SECRET:**
```bash
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | % {[char]$_})

# Or use Python
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

### 2. Update Google OAuth Console

Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. **Navigate to**: APIs & Services → Credentials
2. **Find your OAuth 2.0 Client ID** (or create one if needed)
3. **Update Authorized redirect URIs**:
   - **ADD**: `https://app.ledger-mind.org/auth/google/callback`
   - **REMOVE**: Any `http://127.0.0.1:*` or `http://localhost:*` entries for production
4. **Save changes**

**Important Notes:**
- The redirect URI must be **exact** (including the path `/auth/google/callback`)
- For development, you can keep localhost entries in a separate OAuth client ID
- Changes may take a few minutes to propagate

### 3. Restart Backend Container

After setting environment variables:

```bash
docker-compose down backend
docker-compose up -d backend
```

Or rebuild if needed:

```bash
docker-compose build backend --no-cache
docker-compose up -d backend
```

### 4. Test OAuth Flow

**Clear Cookies First:**
1. Open DevTools (F12)
2. Application → Storage → Clear site data
3. Close and reopen browser (or use Incognito)

**Test Steps:**
1. Go to `https://app.ledger-mind.org`
2. Click "Sign in with Google"
3. **Verify** the URL stays on `https://app.ledger-mind.org/auth/google/callback?...` (NOT `127.0.0.1`)
4. Should redirect you into the app after Google authentication
5. Check browser DevTools console for any errors

**Expected Result:**
- Callback URL: `https://app.ledger-mind.org/auth/google/callback?state=...&code=...`
- HTTP Status: `307 Temporary Redirect` → `/` (signed in)
- Cookies set:
  - `lm_oauth_session` (session state)
  - `access_token` (JWT)
  - `refresh_token` (JWT)

## Cookie Configuration Summary

| Cookie | Domain | Secure | SameSite | Purpose |
|--------|--------|--------|----------|---------|
| `lm_oauth_session` | `.ledger-mind.org` | `true` | `none` | OAuth state/PKCE storage |
| `access_token` | `.ledger-mind.org` | `true` | `lax` | JWT authentication |
| `refresh_token` | `.ledger-mind.org` | `true` | `lax` | JWT refresh |

**Why SameSite=none for OAuth session?**
- Google redirects from `accounts.google.com` → `app.ledger-mind.org`
- This is a cross-site redirect
- `SameSite=lax` would block the cookie
- `SameSite=none` + `Secure=true` allows cross-site redirects over HTTPS

## Troubleshooting

### Still getting "OAuth state mismatch"?

1. **Check cookies are being set:**
   - DevTools → Application → Cookies
   - Should see `lm_oauth_session` cookie with domain `.ledger-mind.org`
   - Should have `Secure` flag and `SameSite=None`

2. **Check backend logs:**
   ```bash
   docker logs ai-finance-backend-1 --tail 50
   ```
   - Look for: "OAuth login: set state + pkce in session"
   - Then: "OAuth callback: state mismatch" (if error)

3. **Verify environment variables:**
   ```bash
   docker exec ai-finance-backend-1 env | grep OAUTH
   docker exec ai-finance-backend-1 env | grep COOKIE
   ```

4. **Check Google OAuth console:**
   - Verify redirect URI is exactly: `https://app.ledger-mind.org/auth/google/callback`
   - No typos, no trailing slashes, exact match

### Getting 502 Bad Gateway on callback?

- **Cause**: Backend container not running or not accessible
- **Fix**: `docker-compose up -d backend`
- **Verify**: `curl http://localhost:8000/healthz` should return `healthy`

### Cookies not persisting after callback?

- **Cause**: `COOKIE_SECURE=1` but testing over HTTP
- **Fix**: Always test over HTTPS (`https://app.ledger-mind.org`)
- **Alternative**: For local dev, set `COOKIE_SECURE=0` (NOT for production)

## Security Notes

- ✅ **SameSite=none requires Secure=true** (cookies only sent over HTTPS)
- ✅ **OAuth session cookies expire after 7 days** (configurable in `main.py`)
- ✅ **State token prevents CSRF** (validates Google's callback is legitimate)
- ✅ **PKCE prevents authorization code interception** (code_challenge + verifier)
- ✅ **Domain=.ledger-mind.org** allows cookies across subdomains

## Next Steps After OAuth Works

1. **Remove old `/api/auth/refresh` 500 error** if unauthenticated
   - Should return `401 Unauthorized` instead of `500 Internal Server Error`
   - This prevents confusion when tokens expire

2. **Consider Redis for state storage** (optional)
   - If you have multiple backend replicas
   - Ensures state is visible to all instances
   - More resilient than in-memory session storage

3. **Add rate limiting** on OAuth endpoints
   - Prevent brute force attacks
   - Recommended: 5 attempts per IP per minute

4. **Monitor OAuth errors**
   - Log failed attempts
   - Alert on high failure rates
   - Track conversion rate (login attempts → successful sign-ins)

## References

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [SameSite Cookie Explained](https://web.dev/samesite-cookies-explained/)
- [PKCE Flow (RFC 7636)](https://datatracker.ietf.org/doc/html/rfc7636)
- [FastAPI Security](https://fastapi.tiangolo.com/tutorial/security/)
