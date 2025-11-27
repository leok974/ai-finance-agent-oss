# Admin Guard - Quick Reference

## ✅ Implementation Complete

All 6 items from the checklist are done:

1. ✅ **Backend guard**: `apps/backend/app/utils/authz.py` + router protection
2. ✅ **Backend tests**: `apps/backend/tests/test_admin_rules_guard.py`
3. ✅ **Lazy loading**: `apps/web/src/App.tsx` with Suspense
4. ✅ **E2E tests**: `apps/web/tests/e2e/admin-rules-ui.spec.ts`
5. ✅ **Unit tests**: `apps/web/src/components/dev/__tests__/DevMenu-admin.test.tsx`
6. ✅ **Production build**: Backend + nginx rebuilt

## Quick Test Commands

### Backend Tests
```bash
# Test admin guard (4 tests)
pytest apps/backend/tests/test_admin_rules_guard.py -v
```

### Frontend Unit Tests
```bash
# Test DevMenu admin visibility (4 tests)
cd apps/web
pnpm test DevMenu-admin
```

### E2E Tests
```bash
# Test UI with real auth (4 tests)
cd apps/web
AUTH_E2E=1 \
  AUTH_EMAIL=user@example.com \
  AUTH_PASSWORD=userpass \
  ADMIN_EMAIL=admin@example.com \
  ADMIN_PASSWORD=admin123 \
  pnpm test:e2e admin-rules-ui
```

## Quick Smoke Test

### 1. Start Stack
```bash
docker compose -f docker-compose.prod.yml up -d
```

### 2. Test Non-Admin (Should Get 403)
```bash
# Login as regular user
curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  -c cookies.txt

# Try to access admin endpoint
curl -s -X GET http://localhost/agent/tools/categorize/rules \
  -b cookies.txt

# Expected: {"detail":"admin only"}
# Status: 403
```

### 3. Test Admin (Should Get 200)
```bash
# Login as admin
curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' \
  -c admin-cookies.txt

# Access admin endpoint
curl -s -X GET http://localhost/agent/tools/categorize/rules \
  -b admin-cookies.txt | jq

# Expected: Array of rules (may be empty)
# Status: 200
```

### 4. Test UI (Manual)

1. **Login as admin**: Open http://localhost, login with admin@example.com
2. **Enable dev mode**: Press `Ctrl+Shift+D`
3. **Open Dev menu**: Click "Dev" button in header
4. **Verify**: "Admin: Category Rules" menu item appears
5. **Toggle panel**: Check the menu item
6. **Wait**: See "Loading admin tools…" briefly
7. **Verify**: Rules panel renders with table

## Files Changed

### Backend
- ✅ `apps/backend/app/utils/authz.py` (NEW)
- ✅ `apps/backend/app/routers/categorize_admin.py` (MODIFIED)
- ✅ `apps/backend/tests/test_admin_rules_guard.py` (NEW)

### Frontend
- ✅ `apps/web/src/App.tsx` (MODIFIED - lazy loading)
- ✅ `apps/web/src/state/auth.tsx` (MODIFIED - useIsAdmin hook)
- ✅ `apps/web/src/components/dev/DevMenu.tsx` (MODIFIED - admin check)
- ✅ `apps/web/src/components/dev/__tests__/DevMenu-admin.test.tsx` (NEW)
- ✅ `apps/web/tests/e2e/admin-rules-ui.spec.ts` (NEW)

### Documentation
- ✅ `docs/ADMIN_GUARD.md` (NEW - comprehensive guide)
- ✅ `docs/ADMIN_GUARD_COMPLETE.md` (NEW - implementation summary)
- ✅ `docs/ADMIN_GUARD_QUICKREF.md` (THIS FILE)

## Security Model

```
┌─────────────────────────────────────────────────┐
│ User attempts to access Admin Rules             │
└──────────────────┬──────────────────────────────┘
                   │
         ┌─────────▼──────────┐
         │ UI Guards          │
         │ (First Defense)    │
         │                    │
         │ 1. Dev mode?       │
         │ 2. isAdmin()?      │
         │ 3. Panel open?     │
         └─────────┬──────────┘
                   │
         ┌─────────▼──────────┐
         │ Lazy Load          │
         │ (Performance)      │
         │                    │
         │ Suspense fallback  │
         │ → Load component   │
         └─────────┬──────────┘
                   │
         ┌─────────▼──────────┐
         │ API Call           │
         │                    │
         │ GET /rules         │
         └─────────┬──────────┘
                   │
         ┌─────────▼──────────┐
         │ Backend Guards     │
         │ (Real Security)    │
         │                    │
         │ require_admin()    │
         │ Check user.roles   │
         └─────────┬──────────┘
                   │
         ┌─────────▼──────────┐
         │ Has admin role?    │
         └─────────┬──────────┘
                   │
         ┌─────────▼──────────┐
         │ ✅ YES → 200 OK    │
         │ ❌ NO  → 403 Forbidden
         └────────────────────┘
```

## Grant Admin Role

### Quick Dev Seed
```bash
# Requires ALLOW_DEV_ROUTES=1
curl -X POST http://127.0.0.1:8000/api/dev/seed-user \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123",
    "roles": ["admin", "user"]
  }'
```

### Production (SQL)
```sql
-- Ensure admin role exists
INSERT INTO roles (name) VALUES ('admin')
ON CONFLICT (name) DO NOTHING;

-- Grant admin role to user
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.email = 'admin@example.com'
  AND r.name = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = u.id AND ur.role_id = r.id
  );
```

## Troubleshooting

### UI: Menu item doesn't appear
```javascript
// Browser console
JSON.parse(localStorage.getItem('user') || '{}').roles
// Should include "admin"
```

### API: Still getting 200 (should be 403)
```bash
# Check router has guard
grep -A2 "router = APIRouter" apps/backend/app/routers/categorize_admin.py
# Should see: dependencies=[Depends(require_admin)]

# Restart backend
docker compose -f docker-compose.prod.yml restart backend
```

### Tests failing
```bash
# Backend: Check DB has test roles/users
docker compose exec postgres psql -U myuser -d finance \
  -c "SELECT u.email, array_agg(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      GROUP BY u.email;"

# Frontend: Check test environment
cd apps/web
pnpm test --run  # Run once to check setup
```

## Next Steps

1. **Deploy to production**: `docker compose -f docker-compose.prod.yml up -d`
2. **Create admin user**: Use dev seed or SQL script
3. **Test admin access**: Login and verify menu item
4. **Test non-admin**: Login as regular user, verify no access
5. **Run tests**: Backend + frontend + E2E
6. **Monitor logs**: Check for 403s in backend logs

## Documentation

- **Complete guide**: `docs/ADMIN_GUARD.md`
- **Implementation summary**: `docs/ADMIN_GUARD_COMPLETE.md`
- **API paths**: `.github/copilot-instructions.md`

---

**Status**: ✅ Ready for production deployment
