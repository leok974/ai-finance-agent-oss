# Dev Superuser Quick Start

## 🚀 One-Time Setup (5 minutes)

### 1. Configure Environment

Edit `secrets/backend.env`:
```bash
APP_ENV=dev
ALLOW_DEV_ROUTES=1
DEV_SUPERUSER_EMAIL=leoklemet.pa@gmail.com
```

### 2. Seed Dev User

```powershell
# Set environment
$env:APP_ENV='dev'
$env:ALLOW_DEV_ROUTES='1'
$env:DEV_SUPERUSER_EMAIL='leoklemet.pa@gmail.com'

# Seed user (run from project root)
cd apps/backend
python -m app.cli_seed_dev_user leoklemet.pa@gmail.com Superleo3
```

### 3. Start Backend

```powershell
# Backend will read from secrets/backend.env
cd apps/backend
python -m app.main  # or your normal start command
```

### 4. Login via UI

- Email: `leoklemet.pa@gmail.com`
- Password: `Superleo3`

### 5. Verify Dev Access

**Check /auth/me:**
```powershell
curl http://127.0.0.1:8000/api/auth/me
```

**Expected response:**
```json
{
  "email": "leoklemet.pa@gmail.com",
  "roles": ["admin"],
  "dev_unlocked": true,  ← MUST BE TRUE
  "env": "dev"           ← MUST BE "dev"
}
```

**UI verification:**
- ✅ RAG Tool Chips visible at top of chat
- ✅ "Seed (dev)" button enabled
- ✅ Can run: "Seed the RAG knowledge base"

## 🎯 Common Commands

### Seed RAG Index
```
"Seed the RAG knowledge base"
```

### Check RAG Status
```
"Show RAG status"
```

### Rebuild Index
```powershell
curl -X POST http://127.0.0.1:8000/agent/tools/rag/rag.rebuild
```

### Update Dev User Password
```powershell
$env:APP_ENV='dev'
python -m app.cli_seed_dev_user leoklemet.pa@gmail.com NewPassword123
```

## ❌ Troubleshooting

### "Dev unlock required" Error

**Check environment:**
```powershell
$env:DEV_SUPERUSER_EMAIL
# Should output: leoklemet.pa@gmail.com
```

**Fix:**
1. Restart backend after setting `DEV_SUPERUSER_EMAIL`
2. Login again (refresh token)
3. Verify `/auth/me` shows `dev_unlocked: true`

### RAG Chips Not Visible

**Required conditions (ALL must be true):**
- ✅ Logged in as admin
- ✅ `dev_unlocked: true` in `/auth/me`
- ✅ `env: "dev"` in `/auth/me`
- ✅ Backend running with `ALLOW_DEV_ROUTES=1`

**Quick check:**
```powershell
# Backend logs should show:
# INFO: attach_dev_overrides: Granted dev_unlocked to leoklemet.pa@gmail.com
```

### "Dev route disabled" Error

**Fix:**
```powershell
$env:APP_ENV='dev'
$env:ALLOW_DEV_ROUTES='1'
# Restart backend
```

## 🔒 Production Safety

**Before deploying to production:**

```bash
# Production environment MUST have:
APP_ENV=prod
ALLOW_DEV_ROUTES=0
# DEV_SUPERUSER_EMAIL=  # UNSET!
```

**Never deploy with:**
- ❌ `APP_ENV=dev`
- ❌ `ALLOW_DEV_ROUTES=1`
- ❌ `DEV_SUPERUSER_EMAIL` set to any value

## 📚 Full Documentation

See `docs/DEV_SUPERUSER_OVERRIDE.md` for:
- Complete security model
- Detailed implementation guide
- Full API reference
- Testing procedures
- Production deployment checklist

## 🆘 Still Having Issues?

1. Check backend logs for auth errors
2. Verify email matches exactly (case-insensitive)
3. Clear browser cookies and login again
4. Check database: `SELECT email, roles FROM users;`
5. See full troubleshooting: `docs/DEV_SUPERUSER_OVERRIDE.md#troubleshooting`
