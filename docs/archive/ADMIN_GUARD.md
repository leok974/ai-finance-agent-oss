# Admin Guard Implementation

This document describes the admin-only access control for the Category Rules management panel.

## Overview

The AdminRulesPanel is restricted to users with the `admin` role. The implementation uses:
- **Role-based access control** via `useIsAdmin()` hook
- **UI-level guards** in DevMenu and App.tsx
- **No routing** (single-page app pattern)
- **Dev mode requirement** (panel only accessible in dev mode)

## Implementation

### 1. Auth Hook

**File**: `apps/web/src/state/auth.tsx`

```typescript
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  return !!user?.roles?.includes("admin");
}
```

The hook checks if the current user has the `"admin"` role in their roles array.

### 2. DevMenu Guard

**File**: `apps/web/src/components/dev/DevMenu.tsx`

The Admin Rules menu item is conditionally rendered:

```tsx
import { useIsAdmin } from "@/state/auth";

export default function DevMenu({ adminRulesOpen, onToggleAdminRules }: DevMenuProps) {
  const isAdmin = useIsAdmin();

  return (
    <DropdownMenuContent>
      {/* ... other menu items ... */}

      {onToggleAdminRules && isAdmin && (
        <DropdownMenuCheckboxItem
          checked={adminRulesOpen}
          onCheckedChange={onToggleAdminRules}
          data-testid="nav-admin-rules"
        >
          <Settings className="h-4 w-4 mr-2" /> Admin: Category Rules
        </DropdownMenuCheckboxItem>
      )}
    </DropdownMenuContent>
  );
}
```

**Access Requirements**:
- Dev mode enabled (`flags.dev`)
- User has admin role (`isAdmin`)
- DevMenu callback provided (`onToggleAdminRules`)

### 3. Panel Render Guard

**File**: `apps/web/src/App.tsx`

```tsx
import { useIsAdmin } from "@/state/auth";

const App: React.FC = () => {
  const isAdmin = useIsAdmin();
  const [adminRulesOpen, setAdminRulesOpen] = useState<boolean>(false);

  return (
    <>
      {/* Admin: Category Rules Management (dev-only, admin-only) */}
      {flags.dev && isAdmin && adminRulesOpen && (
        <div className="section">
          <AdminRulesPanel />
        </div>
      )}
    </>
  );
}
```

**Triple Guard**:
1. ✅ Dev mode (`flags.dev`)
2. ✅ Admin role (`isAdmin`)
3. ✅ User toggled panel on (`adminRulesOpen`)

## User Roles

### Admin User
```typescript
{
  email: "admin@example.com",
  roles: ["admin", "user"],
  is_active: true
}
```

**Can Access**:
- ✅ Dev menu (if dev mode enabled)
- ✅ "Admin: Category Rules" menu item
- ✅ AdminRulesPanel (when toggled on)
- ✅ All CRUD operations on rules
- ✅ Regex pattern tester
- ✅ Rule promotion endpoint

### Regular User
```typescript
{
  email: "user@example.com",
  roles: ["user"],
  is_active: true
}
```

**Can Access**:
- ✅ Dev menu (if dev mode enabled)
- ❌ "Admin: Category Rules" menu item (hidden)
- ❌ AdminRulesPanel (cannot toggle it on)
- ✅ All other dev tools (Planner, etc.)

### Unauthenticated User
```typescript
null
```

**Can Access**:
- ❌ Nothing (login required)

## Testing

### Unit Tests

**File**: `apps/web/src/components/dev/__tests__/DevMenu-admin.test.tsx`

```bash
# Run tests
pnpm --filter web test DevMenu-admin
```

Test coverage:
- ✅ Admin users see the menu item
- ✅ Non-admin users don't see the menu item
- ✅ Unauthenticated users don't see the menu item
- ✅ Other dev tools remain visible to all dev users

### Manual Testing

#### Test as Admin

1. **Login as admin**:
   ```bash
   # Use your backend auth endpoint
   curl -X POST http://localhost:8000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"admin123"}'
   ```

2. **Enable dev mode**:
   - Press `Ctrl+Shift+D` (hard toggle with reload)
   - Or set `VITE_DEV_UI=1` in environment

3. **Open Dev menu**:
   - Click "Dev" button in header
   - Should see "Admin: Category Rules" checkbox

4. **Toggle Admin Rules panel**:
   - Check "Admin: Category Rules"
   - Panel appears below main content

5. **Verify panel features**:
   - Rules table loads
   - Can edit inline (pattern, category, priority)
   - Can toggle enabled checkbox
   - Can delete rules (with confirmation)
   - Regex tester works

#### Test as Non-Admin

1. **Login as regular user**:
   ```bash
   curl -X POST http://localhost:8000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"password"}'
   ```

2. **Enable dev mode** (same as above)

3. **Open Dev menu**:
   - Click "Dev" button
   - "Admin: Category Rules" should NOT appear
   - Other dev tools still visible

#### Test Unauthenticated

1. **Logout**: Click account menu → Logout

2. **Dev menu**: Should not be visible (requires auth)

## Security Considerations

### UI-Level Guards Only

⚠️ **Important**: These guards are **UI-level only**. They prevent UI rendering but do NOT protect backend endpoints.

The backend MUST have its own authorization:
```python
# Backend example (FastAPI)
from app.auth import require_admin

@router.patch("/agent/tools/categorize/rules/{rule_id}")
@require_admin  # Backend auth decorator
async def update_rule(rule_id: int, updates: dict, user = Depends(get_current_user)):
    if "admin" not in user.roles:
        raise HTTPException(403, "Admin role required")
    # ... update logic
```

### Why UI + Backend?

1. **UI Guards**: Better UX (hide features user can't use)
2. **Backend Guards**: Real security (prevent API abuse)

Both layers are essential for production security.

## Backend Role Assignment

To grant admin role to a user:

```sql
-- PostgreSQL example
UPDATE users
SET roles = array_append(roles, 'admin')
WHERE email = 'admin@example.com';
```

Or via backend admin script:
```python
# apps/backend/app/scripts/grant_admin.py
from app.db import SessionLocal
from app.models import User

def grant_admin(email: str):
    db = SessionLocal()
    user = db.query(User).filter(User.email == email).first()
    if user and "admin" not in user.roles:
        user.roles.append("admin")
        db.commit()
        print(f"✓ Granted admin to {email}")
    else:
        print(f"✗ User {email} not found or already admin")
    db.close()

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python -m app.scripts.grant_admin <email>")
        sys.exit(1)
    grant_admin(sys.argv[1])
```

Usage:
```bash
docker compose exec backend python -m app.scripts.grant_admin admin@example.com
```

## Production Checklist

Before deploying to production:

- [ ] Backend endpoints have role-based auth decorators
- [ ] Admin role properly assigned in database
- [ ] UI guards tested (unit + manual)
- [ ] Backend guards tested (API tests)
- [ ] Audit logging for admin actions (optional but recommended)
- [ ] Rate limiting on admin endpoints
- [ ] CSRF protection enabled
- [ ] Session management secure

## Troubleshooting

### "Admin Rules menu item doesn't appear"

**Check**:
1. Dev mode enabled? (`Ctrl+Shift+D`)
2. User logged in?
3. User has `"admin"` in roles array?
4. Browser console errors?

**Verify role**:
```typescript
// In browser console
JSON.parse(localStorage.getItem('user') || '{}').roles
// Should include "admin"
```

### "Panel appears but CRUD operations fail"

**Likely causes**:
- Backend endpoints missing auth decorators
- User session expired
- CORS issues
- Backend not running

**Debug**:
```bash
# Check backend logs
docker compose logs -f backend

# Test endpoint directly
curl -X GET http://localhost:8000/agent/tools/categorize/rules \
  -H "Cookie: session=..." \
  -v
```

### "Other users can still access backend endpoints"

**This is expected** - UI guards don't protect backend.

**Solution**: Add backend authorization:
```python
@router.patch("/agent/tools/categorize/rules/{rule_id}")
async def update_rule(
    rule_id: int,
    updates: dict,
    user = Depends(get_current_user)
):
    # Add this check
    if "admin" not in (user.roles or []):
        raise HTTPException(
            status_code=403,
            detail="Admin role required for rules management"
        )
    # ... rest of handler
```

## Future Enhancements

Potential improvements:

1. **Route-based guards** (if app adds React Router):
   ```tsx
   <Route path="/admin/rules" element={
     <AdminRoute><AdminRulesPanel /></AdminRoute>
   } />
   ```

2. **Permission granularity**:
   - `rules:read` - View rules
   - `rules:write` - Edit rules
   - `rules:delete` - Delete rules
   - `rules:promote` - Promote to rule

3. **Audit logging**:
   - Track all admin actions
   - Who/what/when for compliance

4. **Admin dashboard**:
   - User management
   - Role assignment UI
   - Activity logs

5. **Multi-tenancy**:
   - Org-level admin vs global admin
   - Workspace-scoped permissions

## API Endpoints Reference

All admin-only endpoints:

```
GET    /agent/tools/categorize/rules          # List all rules
PATCH  /agent/tools/categorize/rules/{id}     # Update rule
DELETE /agent/tools/categorize/rules/{id}     # Delete rule
POST   /agent/tools/categorize/rules/test     # Test regex pattern
POST   /agent/tools/categorize/promote        # Promote to rule
```

See `docs/CATEGORIZATION_HARDENING.md` for endpoint details.

## Summary

✅ **What's Protected**:
- UI visibility of admin features
- Dev menu admin options
- AdminRulesPanel rendering

❌ **What's NOT Protected** (yet):
- Backend API endpoints (add auth decorators)
- Direct API access (needs backend guards)

🔒 **Security Model**:
- **UI**: Role-based rendering
- **Backend**: Role-based authorization (TODO)
- **Combined**: Defense in depth

For production deployment, ensure both UI and backend guards are in place.
