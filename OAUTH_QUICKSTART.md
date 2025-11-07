# OAuth Quick Start - Copy & Paste Commands

## 🚀 Complete Setup (Already Done!)

All files created and configured. Only need to add Google OAuth credentials.

---

## 1️⃣ Get Google OAuth Credentials

1. Visit: https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add redirect URI: `http://127.0.0.1:8000/auth/google/callback`
4. Copy Client ID and Client Secret

---

## 2️⃣ Update .env File

```powershell
# Edit apps/backend/.env and replace these values:
notepad apps\backend\.env
```

Replace:
```env
OAUTH_GOOGLE_CLIENT_ID=__FILL_ME__.apps.googleusercontent.com
OAUTH_GOOGLE_CLIENT_SECRET=__FILL_ME__
```

With your actual credentials:
```env
OAUTH_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
OAUTH_GOOGLE_CLIENT_SECRET=GOCSPX-abc123def456
```

Generate random SESSION_SECRET:
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

---

## 3️⃣ Add AuthMenu to Frontend

Edit your header component (e.g., `apps/web/src/components/AppShell.tsx`):

```tsx
import AuthMenu from './AuthMenu';

// In your header JSX:
<header className="flex justify-between items-center p-4">
  <nav>...</nav>
  <AuthMenu />  {/* Add this */}
</header>
```

---

## 4️⃣ Start Backend & Test

```powershell
# Terminal 1: Start backend
cd apps\backend
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Test endpoints
cd apps\backend

# Health check
Invoke-RestMethod http://127.0.0.1:8000/health

# Test /auth/me (should return 401 - not logged in)
try {
    Invoke-RestMethod http://127.0.0.1:8000/auth/me
} catch {
    Write-Host "✓ Expected 401: Not logged in" -ForegroundColor Green
}

# Open browser to test login
Start-Process "http://127.0.0.1:8000/auth/google/login"
```

After completing Google sign-in:
```powershell
# Should now return your profile
Invoke-RestMethod http://127.0.0.1:8000/auth/me
```

---

## 5️⃣ Production Deployment

Update `.env` for production:
```env
OAUTH_REDIRECT_URL=https://app.ledger-mind.org/auth/google/callback
COOKIE_DOMAIN=.ledger-mind.org
COOKIE_SECURE=1
```

Add prod redirect URI in Google Console:
- `https://app.ledger-mind.org/auth/google/callback`

---

## 📋 Endpoints Created

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/google/login` | GET | Start OAuth flow |
| `/auth/google/callback` | GET | OAuth callback |
| `/auth/google/logout` | POST | Clear session |
| `/auth/me` | GET | Get current user |

---

## 🐛 Troubleshooting

### "redirect_uri_mismatch"
→ Add callback URL to Google OAuth credentials

### "401 Invalid session"
→ Check SESSION_SECRET matches in .env

### Cookie not setting
→ Dev: `COOKIE_DOMAIN=127.0.0.1`, `COOKIE_SECURE=0`
→ Prod: `COOKIE_DOMAIN=.ledger-mind.org`, `COOKIE_SECURE=1`

---

## 📝 Files Created

✅ Backend:
- `apps/backend/app/auth/__init__.py`
- `apps/backend/app/auth/google.py`
- `apps/backend/.env` (OAuth config added)
- `apps/backend/app/main.py` (SessionMiddleware + routes)

✅ Frontend:
- `apps/web/src/components/AuthMenu.tsx`

✅ Documentation:
- `OAUTH_SETUP.md` (full guide)
- `OAUTH_QUICKSTART.md` (this file)

---

## 🔐 Security Features

✅ PKCE (Proof Key for Code Exchange)
✅ CSRF protection (state validation)
✅ Secure signed cookies (HttpOnly, SameSite)
✅ No database session storage needed

---

## 💡 Next Steps

1. **Get Google OAuth credentials** (5 min)
2. **Update .env file** (1 min)
3. **Add `<AuthMenu />` to header** (2 min)
4. **Test login flow** (2 min)

Total setup time: ~10 minutes

---

## 📖 Full Documentation

See `OAUTH_SETUP.md` for:
- Detailed API documentation
- Production deployment guide
- Testing strategies
- Adding GitHub OAuth
- Troubleshooting guide
