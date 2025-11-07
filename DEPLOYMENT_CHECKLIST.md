# Production Deployment Checklist

**Date**: 2025-11-07
**Branch**: ml-pipeline-2.1
**Target Environment**: Production (https://app.ledger-mind.org)

---

## 🎯 Changes Ready for Deployment

### 1. Production E2E Testing Framework ✅
- **CDP attach support** for Google OAuth bypass
- **Captured production state** ready (`prod-state.json`)
- **Robust test suite**: 4 passing tests (smoke, upload, 2 validation)
- **Session validation** utilities with helpful error messages
- **Documentation**: Comprehensive PROD-TESTING.md guide

### 2. Chat Clear Button Fixes ✅
- **Store improvements**: Synchronous clear, version counter, cross-tab sync
- **Abort controller**: Cancels in-flight requests before clearing
- **Force re-render**: React key-based unmounting for reliable UX
- **BroadcastChannel**: Echo-loop prevention with instance IDs
- **Test coverage**: Unit + component tests passing

### 3. User Isolation (Already Deployed) ✅
- **Migration applied**: user_id column exists
- **Backfill complete**: All transactions assigned to users
- **Auth guard active**: Middleware enforcing isolation
- **Tests passing**: 4/4 isolation tests verified

---

## 📋 Pre-Deployment Steps

### Step 1: Commit Changes

```powershell
# Navigate to root
cd c:\ai-finance-agent-oss-clean

# Stage all changes
git add .

# Create deployment commit
git commit -m "feat(e2e): add production testing framework with robust selectors

- CDP attach support for Google OAuth bypass
- Session validation with helpful error messages
- Robust CSV validation tests (ARIA roles + generic patterns)
- Comprehensive documentation and test tags
- 4 passing production tests (smoke, upload, 2 validation)

Also includes:
- fix(chat): BroadcastChannel echo-loop prevention
- test: comprehensive unit and component test coverage
- docs: production testing guide and monitoring runbooks"

# Push to remote
git push origin ml-pipeline-2.1
```

### Step 2: Verify CI/CD (if applicable)

```powershell
# Check GitHub Actions or your CI pipeline
# Ensure all tests pass before deployment
```

### Step 3: Backend Tests

```powershell
cd apps/backend
.\.venv\Scripts\python.exe -m pytest tests/ -v
```

### Step 4: Frontend Tests

```powershell
cd apps/web
pnpm run typecheck
pnpm test --run
```

### Step 5: Build Production Images

```powershell
# From repository root
cd c:\ai-finance-agent-oss-clean

# Set build metadata
$env:GIT_BRANCH = "ml-pipeline-2.1"
$env:GIT_COMMIT = git rev-parse --short HEAD
$env:BUILD_TIME = Get-Date -Format "o"
$env:VITE_GIT_BRANCH = $env:GIT_BRANCH
$env:VITE_GIT_COMMIT = $env:GIT_COMMIT
$env:BUILD_ID = "$env:GIT_COMMIT-$(Get-Date -Format 'yyyyMMddHHmmss')"

# Build all services
docker compose -f docker-compose.prod.yml build

# Expected output:
# ✅ backend: Successfully built
# ✅ nginx: Successfully built (includes web SPA)
# ✅ agui: Successfully built
```

---

## 🚀 Deployment Steps

### Option A: Rolling Update (Recommended)

```powershell
# 1. Pull latest images (if using registry)
docker compose -f docker-compose.prod.yml pull

# 2. Deploy backend first
docker compose -f docker-compose.prod.yml up -d --no-deps backend

# 3. Wait for health check
docker compose -f docker-compose.prod.yml ps backend
# Should show: Up X seconds (healthy)

# 4. Deploy nginx (frontend)
docker compose -f docker-compose.prod.yml up -d --no-deps nginx

# 5. Deploy remaining services
docker compose -f docker-compose.prod.yml up -d
```

### Option B: Full Restart (Faster but brief downtime)

```powershell
# Stop all services
docker compose -f docker-compose.prod.yml down

# Start with new images
docker compose -f docker-compose.prod.yml up -d

# Monitor startup
docker compose -f docker-compose.prod.yml logs -f --tail=50
```

---

## ✅ Post-Deployment Verification

### 1. Service Health Checks

```powershell
# Check all containers are up
docker compose -f docker-compose.prod.yml ps

# Expected output:
# backend       Up X seconds (healthy)
# nginx         Up X seconds (healthy)
# postgres      Up X seconds (healthy)
# redis         Up X seconds (healthy)
# cloudflared   Up X seconds
# agui          Up X seconds (healthy)
```

### 2. API Health

```powershell
# Backend health
curl https://app.ledger-mind.org/api/health
# Expected: {"ok":true}

# Auth endpoint
curl https://app.ledger-mind.org/api/auth/me
# Expected: 401 or user data if session exists
```

### 3. Frontend Load Test

```powershell
# Open browser
Start-Process "https://app.ledger-mind.org"

# Verify:
# ✅ Page loads without errors
# ✅ Login button visible
# ✅ No console errors (F12)
# ✅ Service worker loads (if applicable)
```

### 4. Chat Clear Button Test

```powershell
# Manual test:
# 1. Open app → login → open chat
# 2. Send a message
# 3. Click Clear button → confirm
# 4. ✅ Messages disappear
# 5. ✅ Refresh page → messages stay cleared
# 6. ✅ No console errors
```

### 5. User Isolation Verification

```powershell
# Backend check (SSH or exec into backend container)
docker compose -f docker-compose.prod.yml exec backend python -c "
from app.db import SessionLocal
from sqlalchemy import text
db = SessionLocal()
null_count = db.execute(text('SELECT COUNT(*) FROM transactions WHERE user_id IS NULL')).scalar()
print(f'NULL user_ids: {null_count}')
assert null_count == 0, 'Found NULL user_ids!'
print('✅ All transactions have user_id')
db.close()
"
```

### 6. Production E2E Tests (Optional)

```powershell
cd apps/web

# If you captured prod state earlier:
if (Test-Path tests/e2e/.auth/prod-state.json) {
    $env:BASE_URL = "https://app.ledger-mind.org"
    $env:PW_SKIP_WS = "1"
    pnpm exec playwright test --project=chromium-prod --reporter=line
}
```

---

## 📊 Monitoring Post-Deployment

### 1. Logs (First 30 minutes)

```powershell
# Watch all services
docker compose -f docker-compose.prod.yml logs -f

# Watch backend only
docker compose -f docker-compose.prod.yml logs -f backend

# Check for errors
docker compose -f docker-compose.prod.yml logs backend | Select-String "ERROR|CRITICAL"
```

### 2. Metrics to Watch

- **Error Rate**: Should stay < 1%
- **Response Time**: Should stay < 500ms for /health
- **Auth Errors**: Check for 401/403 spike (indicates session issues)
- **Container Restarts**: Should be 0

### 3. User Reports

Monitor for:
- ❌ "Can't see my transactions" → Check user isolation
- ❌ "Chat clear not working" → Check BroadcastChannel
- ❌ "Can't login" → Check OAuth config

---

## 🔄 Rollback Plan

### If Issues Detected

```powershell
# Option 1: Rollback to previous commit
git checkout 3661f68d  # Previous stable commit
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Option 2: Restore from backup (if available)
# Restore database snapshot from before deployment
# Redeploy previous Docker images
```

### Quick Rollback Commands

```powershell
# Stop broken services
docker compose -f docker-compose.prod.yml stop backend nginx

# Deploy previous version
docker compose -f docker-compose.prod.yml up -d backend nginx

# Verify health
docker compose -f docker-compose.prod.yml ps
```

---

## 📝 Deployment Notes

### What Changed

**Frontend (apps/web)**:
- Production E2E testing framework (no runtime impact)
- Chat clear button improvements (user-facing)
- BroadcastChannel echo-loop prevention (stability)
- Test infrastructure (dev-only)

**Backend (apps/backend)**:
- User isolation already deployed (56d250bf)
- No new backend changes in this deployment

**Documentation**:
- Added comprehensive production testing guides
- Added monitoring runbooks
- Added deployment checklists

### Risk Assessment

**Low Risk Changes**:
- ✅ E2E testing framework (tests only, no prod code)
- ✅ Documentation updates
- ✅ Test utilities and fixtures

**Medium Risk Changes**:
- ⚠️ Chat clear button (affects UX, but well-tested)
- ⚠️ BroadcastChannel logic (cross-tab sync edge cases)

**Mitigation**:
- Comprehensive unit and component tests passing
- Manual testing completed
- Rollback plan ready
- No database migrations required

### Success Criteria

- [ ] All containers healthy
- [ ] API responding (200 for /health)
- [ ] Frontend loads without errors
- [ ] Chat clear works correctly
- [ ] No spike in error logs
- [ ] User isolation still working (0 NULL user_ids)
- [ ] Production E2E tests passing (if run)

---

## 🎉 Post-Deployment Tasks

### 1. Update Documentation

```powershell
# Create deployment record
@"
# Deployment - $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

**Commit**: $(git rev-parse --short HEAD)
**Branch**: ml-pipeline-2.1
**Deployed By**: [Your Name]
**Duration**: [X minutes]

## Changes
- Production E2E testing framework
- Chat clear button fixes
- BroadcastChannel improvements

## Status
✅ Deployment successful
✅ All health checks passing
✅ No errors in logs (first 30 min)

## Rollback
If needed, revert to: 3661f68d
"@ | Out-File -Append DEPLOYMENT_LOG.md
```

### 2. Notify Team

- Update Slack/Discord with deployment status
- Share production E2E test results
- Document any issues or learnings

### 3. Schedule Follow-Up

- [ ] Check logs after 24 hours
- [ ] Verify metrics dashboard (if available)
- [ ] Collect user feedback
- [ ] Run full production E2E suite weekly

---

## 📞 Support Contacts

**If Deployment Fails**:
1. Check logs immediately: `docker compose -f docker-compose.prod.yml logs -f`
2. Run rollback commands above
3. File incident report with logs attached

**Production URLs**:
- App: https://app.ledger-mind.org
- API Health: https://app.ledger-mind.org/api/health
- Auth Endpoint: https://app.ledger-mind.org/api/auth/me

---

**Deployment Status**: ⏳ READY TO DEPLOY
**Next Action**: Execute Step 1 (Commit Changes) → Step 5 (Build) → Deployment Steps
