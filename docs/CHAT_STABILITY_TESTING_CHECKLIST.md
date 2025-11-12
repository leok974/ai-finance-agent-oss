# Chat Stability - Testing Checklist

## Pre-Deployment Verification

### ✅ Code Quality
- [x] TypeScript compilation passes (`pnpm run typecheck`)
- [x] No ESLint errors in modified files
- [x] Error boundaries have fallback props
- [x] All imports resolved correctly

### ✅ Local Development Testing

#### 1. Chat Disabled (Default Production Behavior)
```bash
# Build with production env
cd apps/web
pnpm run build:prod

# Serve production build
pnpm run preview
```

**Test**:
- [ ] Visit http://localhost:4173/
- [ ] Dashboard loads without errors
- [ ] No chat UI appears
- [ ] Console shows no React errors
- [ ] Browser DevTools → Application → Local Storage: `lm:disableChat` should NOT exist

#### 2. Chat Disabled via Query Param
**Test**:
- [ ] Visit http://localhost:4173/?chat=0
- [ ] Same as default (no chat)
- [ ] No errors in console

#### 3. Chat Enabled via Query Param
**Test**:
- [ ] Visit http://localhost:4173/?chat=1
- [ ] Wait 3-5 seconds for idle callback
- [ ] Console shows: `[chat] mounted`
- [ ] Check Elements tab: `<div id="chatdock-host">` exists
- [ ] Chat UI appears (if ChatDock is visible by default)
- [ ] No React hydration errors
- [ ] No "Minified React error #185" in console

#### 4. Fuse Trip Simulation
**Test**:
- [ ] Open DevTools → Console
- [ ] Run: `localStorage.setItem('lm:disableChat', '1')`
- [ ] Reload page with `?chat=1`
- [ ] Chat should NOT mount
- [ ] Console shows no "[chat] mounted" message
- [ ] Open Dev Menu (if unlocked)
- [ ] See "Enable Chat (fuse tripped)" option
- [ ] Click it → redirects to `?chat=1` and clears fuse
- [ ] Chat mounts successfully

#### 5. Error Boundary Test
**Test**:
- [ ] Temporarily break ChatDock component (add `throw new Error('test')`)
- [ ] Visit `?chat=1`
- [ ] Console shows: `[chat] mount error → fuse trip`
- [ ] Main app remains stable (dashboard still works)
- [ ] Reload page → chat does NOT mount (fuse active)
- [ ] Check localStorage: `lm:disableChat === '1'`

### ✅ Playwright Tests

```bash
cd apps/web
pnpm test:e2e -- prod-no-chat.spec.ts
pnpm test:e2e -- prod-chat.spec.ts
```

**Expected Results**:
- [ ] `prod-no-chat.spec.ts` - All tests pass (3/3)
  - Plain dashboard loads
  - chat=0 works
  - Prefetch works with chat disabled
- [ ] `prod-chat.spec.ts` - All tests pass (4/4)
  - chat=1 loads without React errors
  - Fuse prevents mount when tripped
  - Dev menu shows recovery option
  - Chat mounts after idle

## Production Deployment Testing

### Stage 1: Deploy to Production
```bash
# From ops directory
docker-compose -f docker-compose.prod.yml build web
docker-compose -f docker-compose.prod.yml up -d web
```

### Stage 2: Verify Default Behavior (No Chat)
**Test URL**: https://app.ledger-mind.org/

- [ ] Dashboard loads successfully
- [ ] No console errors
- [ ] No chat UI visible
- [ ] Network tab: Frontend bundle loaded correctly
- [ ] Check env: `VITE_CHAT_ENABLED` should be `0` in build

### Stage 3: Test Chat Disabled Override
**Test URL**: https://app.ledger-mind.org/?chat=0

- [ ] Same behavior as default
- [ ] No chat mounting attempts in console

### Stage 4: Test Chat Enabled (Opt-In)
**Test URL**: https://app.ledger-mind.org/?chat=1

- [ ] Wait 3-5 seconds after page load
- [ ] Console shows: `[chat] mounted` (if no errors)
- [ ] Chat UI appears or loads gracefully
- [ ] No React hydration errors
- [ ] Main dashboard remains functional

### Stage 5: Test Prefetch Flag
**Test URLs**:
- https://app.ledger-mind.org/?prefetch=0 (disabled)
- https://app.ledger-mind.org/?prefetch=1 (enabled)

- [ ] Both URLs load without errors
- [ ] Prefetch=0 skips background data loading
- [ ] Prefetch=1 preloads data (check Network tab)

### Stage 6: Combination Tests
**Test URLs**:
- https://app.ledger-mind.org/?chat=0&prefetch=0 (minimal)
- https://app.ledger-mind.org/?chat=1&prefetch=1 (full features)
- https://app.ledger-mind.org/?chat=1&prefetch=0 (chat only)

- [ ] All combinations load without crashing
- [ ] No unexpected interactions between flags

## Monitoring Checklist

### Production Console Logs
Watch for these patterns in browser console (use Sentry/LogRocket):

**Good**:
- `[Web] branch=ml-pipeline-2.1, commit=...`
- `[chat] mounted` (when ?chat=1)
- No errors

**Bad** (requires investigation):
- `[chat] mount error → fuse trip`
- `[chat] bootstrap error → fuse trip`
- `Minified React error #185`
- `Uncaught Error` in chatMount.tsx

### Fuse Trip Detection
Monitor these localStorage keys across user sessions:
```javascript
// Check in production analytics
const fuseTripped = localStorage.getItem('lm:disableChat') === '1';
if (fuseTripped) {
  console.warn('[monitoring] Chat fuse tripped for user');
  // Send to analytics
}
```

### Success Metrics
- [ ] 0% increase in error rate after deployment
- [ ] Dashboard load time unchanged or improved
- [ ] No reports of "blank screen" or "page crash"
- [ ] Chat works for users who explicitly enable it (?chat=1)

## Rollback Triggers

Immediate rollback if:
1. ❌ Dashboard fails to load for >1% of users
2. ❌ Console shows React hydration errors on default route
3. ❌ Infinite reload loops detected
4. ❌ >10% of users trigger chat fuse
5. ❌ Performance regression >200ms on initial load

## Rollback Procedure

```bash
# Option 1: Revert frontend build
git revert HEAD~1  # or specific commit
cd apps/web && pnpm run build:prod
docker-compose -f ops/docker-compose.prod.yml build web
docker-compose -f ops/docker-compose.prod.yml up -d web

# Option 2: Emergency disable via env
# Edit .env.production.local
VITE_CHAT_ENABLED=0  # Already set, no change needed
VITE_PREFETCH_ENABLED=0  # If prefetch also problematic

# Rebuild and deploy
pnpm run build:prod
docker-compose restart web
```

## Sign-Off

- [ ] All pre-deployment tests passed
- [ ] TypeScript compilation clean
- [ ] Playwright tests green
- [ ] Local production build tested
- [ ] Documentation updated
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured

**Tested By**: _______________  
**Date**: _______________  
**Approved for Production**: ⬜ Yes / ⬜ No  
**Notes**:

---

**Next Steps After Successful Deployment**:
1. Monitor error rates for 24-48 hours
2. Gradually increase chat exposure (A/B test 10% → 50% → 100%)
3. Collect user feedback on chat stability
4. Plan chat feature improvements based on telemetry
