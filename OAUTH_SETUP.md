# Google OAuth Setup - LedgerMind

## ✅ Setup Complete

All OAuth components have been installed and configured:

### Backend Components Created:
1. ✅ **Dependencies installed**: `authlib`, `python-jose[cryptography]`, `itsdangerous`
2. ✅ **OAuth router**: `apps/backend/app/auth/google.py`
   - PKCE flow (Proof Key for Code Exchange)
   - CSRF state validation
   - Secure signed session cookies
3. ✅ **Middleware**: SessionMiddleware added to `app/main.py`
4. ✅ **Endpoints**:
   - `GET /auth/google/login` - Initiates OAuth flow
   - `GET /auth/google/callback` - OAuth callback handler
   - `POST /auth/google/logout` - Clears session cookie
   - `GET /auth/me` - Returns current user profile

### Frontend Component Created:
✅ **AuthMenu component**: `apps/web/src/components/AuthMenu.tsx`
   - Shows "Sign in with Google" button when logged out
   - Shows user profile picture, name, and logout button when logged in

### Configuration:
✅ **Environment variables** added to `apps/backend/.env`:
```env
OAUTH_GOOGLE_CLIENT_ID=__FILL_ME__.apps.googleusercontent.com
OAUTH_GOOGLE_CLIENT_SECRET=__FILL_ME__
OAUTH_REDIRECT_URL=http://127.0.0.1:8000/auth/google/callback
SESSION_SECRET=change_me_long_random_string
COOKIE_DOMAIN=127.0.0.1
COOKIE_SECURE=0
```

---

## 🔧 Setup Steps

### 1. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure consent screen if prompted
6. Application type: **Web application**
7. Authorized redirect URIs:
   - Dev: `http://127.0.0.1:8000/auth/google/callback`
   - Prod: `https://app.ledger-mind.org/auth/google/callback`
8. Copy the **Client ID** and **Client Secret**

### 2. Update .env File

Edit `apps/backend/.env` and replace:
```env
OAUTH_GOOGLE_CLIENT_ID=YOUR_ACTUAL_CLIENT_ID.apps.googleusercontent.com
OAUTH_GOOGLE_CLIENT_SECRET=YOUR_ACTUAL_CLIENT_SECRET
SESSION_SECRET=<generate_random_string_here>
```

Generate a secure SESSION_SECRET:
```powershell
# PowerShell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

### 3. Add AuthMenu to Frontend

Edit your header/navbar component (e.g., `AppShell.tsx`):
```tsx
import AuthMenu from '@/components/AuthMenu';

// In your header JSX:
<header className="...">
  <nav>...</nav>
  <AuthMenu />
</header>
```

### 4. Start Backend

```powershell
cd apps\backend
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 5. Test Endpoints

```powershell
# Health check
Invoke-RestMethod http://127.0.0.1:8000/health

# Test /auth/me without login (should return 401)
try {
    Invoke-RestMethod http://127.0.0.1:8000/auth/me -ErrorAction Stop
} catch {
    Write-Host "Expected 401: $($_.Exception.Response.StatusCode.value__)"
}
```

### 6. Test Login Flow

1. Open browser: **http://127.0.0.1:8000/auth/google/login**
2. Complete Google sign-in
3. You'll be redirected to `/` with `lm_session` cookie set
4. Test `/auth/me`:
   ```powershell
   Invoke-RestMethod http://127.0.0.1:8000/auth/me
   ```
   Should return:
   ```json
   {
     "sub": "google_user_id",
     "email": "your@email.com",
     "name": "Your Name",
     "picture": "https://...",
     "iss": "google"
   }
   ```

---

## 🚀 Production Deployment

### Environment Variables (Prod)

Update `.env` for production:
```env
OAUTH_GOOGLE_CLIENT_ID=<prod_client_id>
OAUTH_GOOGLE_CLIENT_SECRET=<prod_secret>
OAUTH_REDIRECT_URL=https://app.ledger-mind.org/auth/google/callback
SESSION_SECRET=<strong_random_secret>
COOKIE_DOMAIN=.ledger-mind.org
COOKIE_SECURE=1
```

### Nginx Configuration

Ensure Nginx proxies OAuth endpoints:
```nginx
location /auth/ {
    proxy_pass http://backend:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Security Checklist

- [ ] `COOKIE_SECURE=1` (HTTPS only)
- [ ] `COOKIE_DOMAIN=.ledger-mind.org` (allows subdomain sharing)
- [ ] Strong `SESSION_SECRET` (32+ random characters)
- [ ] Valid Google OAuth redirect URI whitelisted
- [ ] CSP headers allow Google OAuth domains
- [ ] Test cookie setting: `Set-Cookie: lm_session; Domain=.ledger-mind.org; Secure; HttpOnly; SameSite=Lax`

---

## 🔐 Security Features

### Implemented Protections:

1. **PKCE (Proof Key for Code Exchange)**
   - Prevents authorization code interception
   - SHA256 code challenge

2. **CSRF Protection**
   - Unique state token per login attempt
   - Validated in callback

3. **Secure Session Cookies**
   - HttpOnly (prevents XSS attacks)
   - Secure flag (HTTPS only in prod)
   - SameSite=Lax (CSRF protection)
   - Signed with `itsdangerous` (tamper-proof)

4. **Session Token Signing**
   - User info encrypted in signed token
   - Salt: `lm-session`
   - No database session storage needed

---

## 📝 API Documentation

### GET /auth/google/login
Initiates OAuth flow with Google.

**Response**: Redirects to Google OAuth consent screen

**Query Params** (auto-generated):
- `code_challenge`: PKCE challenge
- `code_challenge_method`: S256
- `state`: CSRF token

---

### GET /auth/google/callback
OAuth callback endpoint.

**Query Params** (from Google):
- `code`: Authorization code
- `state`: CSRF token (validated)

**Response**: Redirects to `/` with `lm_session` cookie set

**Errors**:
- `400 Invalid state`: CSRF token mismatch
- `400 Missing PKCE`: Code verifier not found in session

---

### POST /auth/google/logout
Clears session cookie.

**Response**: Redirects to `/` with cleared `lm_session` cookie

---

### GET /auth/me
Returns current user profile from session.

**Headers**:
- `Cookie: lm_session=<signed_token>`

**Response** (200):
```json
{
  "sub": "google_user_id",
  "email": "user@example.com",
  "name": "John Doe",
  "picture": "https://lh3.googleusercontent.com/...",
  "iss": "google"
}
```

**Errors**:
- `401 No session`: Cookie not present
- `401 Invalid session`: Cookie signature invalid or expired

---

## 🧪 Testing

### Manual Testing

```powershell
# 1. Start backend
cd apps\backend
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 2. Test health
Invoke-RestMethod http://127.0.0.1:8000/health

# 3. Test /auth/me (should fail with 401)
try { Invoke-RestMethod http://127.0.0.1:8000/auth/me } catch { $_.Exception.Response.StatusCode }

# 4. Open browser and test login
Start-Process "http://127.0.0.1:8000/auth/google/login"
```

### Integration Testing

Create `apps/backend/test_oauth.py`:
```python
import requests

def test_auth_flow():
    # 1. No session should return 401
    r = requests.get("http://127.0.0.1:8000/auth/me")
    assert r.status_code == 401

    # 2. Login redirects to Google
    r = requests.get("http://127.0.0.1:8000/auth/google/login", allow_redirects=False)
    assert r.status_code == 302
    assert "accounts.google.com" in r.headers["Location"]

    # Manual step: Complete OAuth flow in browser
    # 3. After login, /auth/me should return profile
    # (requires valid lm_session cookie from browser)
```

---

## 🐛 Troubleshooting

### Issue: "400 Invalid state"
**Cause**: CSRF token mismatch or session expired
**Fix**: Clear browser cookies and try again

### Issue: "400 Missing PKCE"
**Cause**: Code verifier not in session (session timeout)
**Fix**: Increase session timeout or restart login flow

### Issue: "401 Invalid session"
**Cause**: Cookie signature invalid or SESSION_SECRET changed
**Fix**: Ensure SESSION_SECRET is consistent across restarts

### Issue: Cookie not setting
**Cause**: Domain mismatch or secure flag issues
**Fix**:
- Dev: Set `COOKIE_DOMAIN=127.0.0.1` and `COOKIE_SECURE=0`
- Prod: Set `COOKIE_DOMAIN=.ledger-mind.org` and `COOKIE_SECURE=1`

### Issue: "redirect_uri_mismatch"
**Cause**: OAuth redirect URI not whitelisted in Google Console
**Fix**: Add exact callback URL to Google OAuth credentials

---

## 🔄 Future Enhancements

### Add GitHub OAuth (similar pattern)

1. Create `apps/backend/app/auth/github.py`:
```python
# Mirror google.py with GitHub OAuth endpoints
CLIENT_ID = os.getenv("OAUTH_GITHUB_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("OAUTH_GITHUB_CLIENT_SECRET", "")
# ...
```

2. Register GitHub OAuth app: https://github.com/settings/developers

3. Add to `app/main.py`:
```python
from app.auth import github as github_auth
app.include_router(github_auth.router)
```

4. Update frontend AuthMenu:
```tsx
<a href="/auth/github/login">Sign in with GitHub</a>
```

### Add Email/Password Auth

Integrate with existing `auth_router` and `auth_oauth_router` for email/password flow.

---

## 📚 Resources

- [Authlib Documentation](https://docs.authlib.org/)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [PKCE RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)
- [itsdangerous](https://itsdangerous.palletsprojects.com/)
