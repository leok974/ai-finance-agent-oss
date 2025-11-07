# Commit Guide - Backend User Avatars

## Summary

Add server-side avatar initial and Google photo URL to `/auth/me` endpoint to prevent client-side flicker and prepare for Google OAuth photo integration.

---

## Files Changed

### Backend (1)
- `apps/backend/app/main.py`

### Frontend (2)
- `apps/web/src/state/auth.tsx`
- `apps/web/src/__tests__/state/auth.spec.ts`

### Nginx (1)
- `ops/nginx/conf.d/app.conf`

### Documentation (2)
- `docs/BACKEND_USER_AVATARS_SUMMARY.md`
- `docs/COMMIT_GUIDE_BACKEND_AVATARS.md`

---

## Commit Message

```
feat(auth): add server-side avatar initial and Google photo URL

Backend:
- Add id, initial, picture_url fields to /auth/me response
- Server computes initial from name/email (prevents flicker)
- picture_url uses existing picture field (ready for Google OAuth)

Frontend:
- Update CurrentUser type with initial? and picture_url? fields
- getUserInitial() prefers server-provided initial
- Graceful fallback to name/email derivation for legacy

Nginx:
- Update CSP img-src to allow Google image hosts
- Add https://lh3.googleusercontent.com
- Add https://*.googleusercontent.com wildcard

Testing:
- Add 6 unit tests for server-provided initial
- Test RTL/Unicode (Ł), whitespace, fallback cases
- 22/22 tests passing, TypeScript clean

Related:
- Eliminates "? → L" avatar flicker on page load
- Prepares for Google OAuth photo integration
- Backward compatible (preserves legacy picture field)
```

---

## Git Commands

```bash
# Stage changes
git add apps/backend/app/main.py
git add apps/web/src/state/auth.tsx
git add apps/web/src/__tests__/state/auth.spec.ts
git add ops/nginx/conf.d/app.conf
git add docs/BACKEND_USER_AVATARS_SUMMARY.md
git add docs/COMMIT_GUIDE_BACKEND_AVATARS.md

# Review diff
git diff --staged

# Commit
git commit -m "feat(auth): add server-side avatar initial and Google photo URL

Backend:
- Add id, initial, picture_url fields to /auth/me response
- Server computes initial from name/email (prevents flicker)
- picture_url uses existing picture field (ready for Google OAuth)

Frontend:
- Update CurrentUser type with initial? and picture_url? fields
- getUserInitial() prefers server-provided initial
- Graceful fallback to name/email derivation for legacy

Nginx:
- Update CSP img-src to allow Google image hosts
- Add https://lh3.googleusercontent.com
- Add https://*.googleusercontent.com wildcard

Testing:
- Add 6 unit tests for server-provided initial
- Test RTL/Unicode (Ł), whitespace, fallback cases
- 22/22 tests passing, TypeScript clean

Related:
- Eliminates \"? → L\" avatar flicker on page load
- Prepares for Google OAuth photo integration
- Backward compatible (preserves legacy picture field)"

# Push (optional)
git push origin ml-pipeline-2.1
```

---

## Verification Steps

### 1. Backend Test (Manual)
```bash
# Start backend
cd apps/backend
python -m app.main

# In another terminal, test /auth/me
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8000/auth/me

# Expected response:
{
  "id": "123",
  "email": "leo@example.com",
  "name": "Leo Klemet",
  "initial": "L",
  "picture_url": null,
  "roles": ["admin"],
  ...
}
```

### 2. Frontend Tests (Automated)
```bash
cd apps/web

# Unit tests
pnpm test auth.spec.ts
# ✅ Expected: 22/22 passing

# TypeScript
pnpm run typecheck
# ✅ Expected: 0 errors
```

### 3. CSP Validation (Manual)
```bash
# Reload nginx with new config
docker compose -f ops/docker-compose.prod.yml exec nginx nginx -s reload

# Test in browser DevTools Console:
# Should NOT see CSP errors for Google images
```

### 4. E2E Test (Manual)
```bash
cd apps/web
pnpm dev

# 1. Open http://localhost:5173
# 2. Login
# 3. Check avatar in header → Should show initial immediately
# 4. Open DevTools → Network → /auth/me → Verify response
```

---

## Breaking Changes

**None.** All changes are additive and backward compatible:
- New fields (`id`, `initial`, `picture_url`) are optional
- Legacy `picture` field preserved
- `getUserInitial` falls back to name/email derivation
- Frontend works with both old and new response schemas

---

## Rollback Plan

If issues arise:

1. **Backend Rollback**
   ```bash
   git revert <commit-hash>
   # Redeploy backend
   ```

2. **Frontend Still Works**
   - `getUserInitial` gracefully handles missing `initial` field
   - Falls back to name/email derivation
   - No frontend changes needed

3. **Nginx CSP Rollback**
   ```bash
   # Revert ops/nginx/conf.d/app.conf
   git checkout HEAD~1 -- ops/nginx/conf.d/app.conf
   docker compose -f ops/docker-compose.prod.yml exec nginx nginx -s reload
   ```

---

## Post-Deployment Tasks

1. **Monitor for CSP Violations**
   ```bash
   # Check nginx error logs
   docker compose -f ops/docker-compose.prod.yml logs nginx | grep "CSP"
   ```

2. **Verify Avatar Display**
   - Test in production with real accounts
   - Check DevTools for any image load errors
   - Verify initial shows immediately (no flicker)

3. **Update Google OAuth Callback** (Future PR)
   ```python
   # apps/backend/app/auth/google.py
   async def oauth_callback(...):
       # ...
       user.picture = google_profile.get('picture')  # Save Google photo URL
       db.commit()
   ```

---

## Related Issues

- Closes: "Avatar shows '?' before loading" (flicker bug)
- Prepares: Google OAuth photo integration
- Related: Chat avatar refactor (already completed)

---

## Documentation

- **Summary**: `docs/BACKEND_USER_AVATARS_SUMMARY.md`
- **API Docs**: Update OpenAPI/Swagger for `/auth/me` response schema
- **CSP Docs**: Update security docs with new img-src directive

---

## Success Metrics

After deployment, measure:
- **Avatar Flicker Rate**: Should drop to 0% (no "? → L" transition)
- **CSP Violations**: No increase in violations for `img-src`
- **Page Load Time**: No regression (initial computed on server)
- **Error Rate**: No increase in auth errors

---

## Known Limitations

1. **Google OAuth Not Yet Integrated**
   - `picture_url` will be `null` until OAuth callback updated
   - Users will see initials (no photos yet)
   - Expected in next PR

2. **No Custom Avatar Upload**
   - Feature planned for future release
   - Will use same `picture_url` field (generic name)

3. **No Avatar Caching**
   - Browser caches images naturally
   - Service Worker caching planned for offline support

---

## Testing Notes

- ✅ Unit tests cover server initial preference
- ✅ Edge cases tested (Unicode, whitespace, fallback)
- ✅ TypeScript compilation verified
- ⏳ E2E tests for avatar display (manual for now)
