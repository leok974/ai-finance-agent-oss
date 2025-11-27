# Dev Menu E2E Test - CI Integration

## Summary

The unified dev menu E2E test (`tests/dev-menu.spec.ts`) has been integrated into two CI workflows for comprehensive coverage.

## CI Workflows Updated

### 1. **e2e-dev-unlock.yml** - Primary Coverage

**File**: `.github/workflows/e2e-dev-unlock.yml`

**When it runs**:
- Every push to any branch
- Every pull request to any branch

**Test execution**:
```yaml
- name: Run E2E (unified dev menu)
  if: matrix.env == 'dev'
  run: pnpm -C apps/web exec playwright test tests/dev-menu.spec.ts
```

**Matrix strategy**:
- Tests in both `dev` and `prod` environments
- Dev menu test only runs in `dev` matrix (where dev unlock is available)

**Environment setup**:
- ✅ Backend started with dev superuser configured
- ✅ Frontend dev server on port 5173
- ✅ PostgreSQL database
- ✅ All test APIs stubbed in the test itself

**What it verifies**:
1. Exactly one Dev button renders
2. 8-digit PIN unlock flow works
3. `/api/agent/models` routing is correct (no 404s)
4. All dev menu actions accessible after unlock

---

### 2. **e2e.yml** - General E2E Coverage

**File**: `.github/workflows/e2e.yml`

**When it runs**:
- Push to `main`, `dev`, or `website-cleaning` branches
- Pull requests to `main` or `dev`
- Only if web or backend files changed

**Test execution**:
```yaml
- name: Run Playwright E2E tests
  run: |
    cd apps/web
    pnpm exec playwright test tests/e2e/help-tooltips.spec.ts
    pnpm exec playwright test tests/dev-menu.spec.ts
```

**Environment setup**:
- ✅ Backend with dev routes enabled
- ✅ Test user seeded in database
- ✅ Vite dev server
- ✅ PostgreSQL service container

---

## Why Two Workflows?

### **e2e-dev-unlock.yml** (Primary)
- **Purpose**: Dedicated dev unlock feature testing
- **Frequency**: Every push/PR (comprehensive)
- **Focus**: Dev-specific features and security
- **Matrix**: Tests dev vs prod behavior
- **Fast**: Runs in parallel with other workflows

### **e2e.yml** (Secondary)
- **Purpose**: General E2E regression suite
- **Frequency**: Only on main branch changes
- **Focus**: Core app functionality
- **Comprehensive**: Full backend setup with migrations
- **Slower**: More thorough setup but less frequent

---

## CI Test Flow

### On Every Push/PR:

```
1. Checkout code
2. Setup Node.js 20 + pnpm 9
3. Install dependencies
4. Install Playwright chromium
5. Setup Python + backend
6. Run dev-menu.spec.ts ← YOUR TEST
7. Upload artifacts (if failed)
```

### Test Duration:
- **Expected**: ~10-15 seconds
- **Timeout**: 30 seconds (test), 15 minutes (job)

### Failure Handling:
- **Retries**: 2 retries in CI (configured in playwright.config.ts)
- **Artifacts**: Playwright report uploaded on failure
- **Screenshots**: Captured on failure
- **Videos**: Retained on failure
- **Traces**: On first retry

---

## Environment Variables in CI

The test uses these environment variables from CI:

```yaml
APP_ENV: dev                              # Enables dev routes
ALLOW_DEV_ROUTES: '1'                     # Backend dev endpoint flag
DEV_SUPERUSER_EMAIL: leoklemet.pa@gmail.com
DEV_SUPERUSER_PIN: ${{ secrets.DEV_SUPERUSER_PIN }}  # GitHub secret
```

**Note**: The test **stubs** the unlock endpoint, so the actual PIN value doesn't matter for the test to pass. The test verifies the frontend behavior only.

---

## Viewing Test Results

### On GitHub Actions:

1. Go to **Actions** tab
2. Select workflow run (e.g., "E2E Tests (Dev Unlock)")
3. Click on job (e.g., "e2e-dev-unlock (dev)")
4. Expand **"Run E2E (unified dev menu)"** step
5. View test output

### Success Output:
```
Running 1 test using 1 worker
  ✓  tests/dev-menu.spec.ts:3:3 › Unified Dev menu + /api routing › exactly one Dev button, unlock flow, and /api agent/models call (no 404) (5s)

  1 passed (5s)
```

### Failure Output:
```
  1) tests/dev-menu.spec.ts:3:3 › Unified Dev menu + /api routing › exactly one Dev button, unlock flow, and /api agent/models call (no 404)

    Error: Found non-/api agent calls: http://127.0.0.1:5173/agent/models
```

---

## Artifacts on Failure

When the test fails, CI automatically uploads:

- **Playwright Report**: HTML report with test results
  - Path: `apps/web/playwright-report/`
  - Retention: 30 days
  - View in Actions → Artifacts

- **Test Results**: JSON test results
  - Path: `apps/web/test-results/`
  - Includes screenshots, videos, traces
  - Retention: 30 days

### Downloading Artifacts:

1. Go to failed workflow run
2. Scroll to **Artifacts** section (bottom)
3. Download `playwright-report-dev.zip`
4. Extract and open `index.html`

---

## Local Testing Before CI

Always test locally before pushing:

```powershell
# Quick test (with dev server running)
pnpm run test:dev-menu

# Full test (starts servers)
pnpm run test:pw tests/dev-menu.spec.ts

# Debug mode
pnpm run test:pw:ui tests/dev-menu.spec.ts
```

---

## Common CI Failures & Fixes

### ❌ "Expected 2 Dev buttons, got 1"

**Issue**: Test expects 1 button but finds multiple

**Fix**:
- Check if `DevBadge` was re-added to `App.tsx`
- Verify only one `<DevMenu />` component renders

### ❌ "Bad agent requests found"

**Issue**: Some code is calling `/agent/models` without `/api`

**Fix**:
- Find the offending code (grep for `fetch('/agent`)
- Update to use `http()` helper from `lib/http.ts`

### ❌ "Route not intercepted"

**Issue**: Test routes not working in CI

**Fix**:
- Verify routes are set up before `page.goto()`
- Check playwright.config.ts has correct baseURL

### ❌ "Timeout waiting for unlock"

**Issue**: Unlock button never becomes enabled

**Fix**:
- Check PIN input accepts exactly 8 characters
- Verify unlock button disabled state logic

---

## Monitoring CI Health

### Success Rate Target:
- **Goal**: 100% pass rate on main branch
- **Acceptable**: 95% pass rate with retries

### Performance Benchmarks:
- **Test execution**: 5-10 seconds
- **Full job**: 2-3 minutes
- **Parallel jobs**: 3-5 minutes total

### Alerts:
- CI failures trigger GitHub notifications
- Failed runs show in PR checks
- Artifacts preserved for debugging

---

## Future Enhancements

Potential additions to the test:

1. **Admin panel toggles**: Test Admin Rules/Knowledge checkboxes
2. **Dev dock toggle**: Verify Dev Dock state management
3. **Multiple environments**: Test in both dev and prod (prod should hide)
4. **Accessibility**: Add axe-core checks for WCAG compliance
5. **Visual regression**: Screenshot comparison for UI changes

---

## Related Documentation

- **Test README**: `apps/web/tests/dev-menu.README.md`
- **Component**: `apps/web/src/features/dev/DevMenu.tsx`
- **Store**: `apps/web/src/state/dev.ts`
- **Playwright Config**: `apps/web/playwright.config.ts`
- **CI Workflows**: `.github/workflows/e2e-dev-unlock.yml`

---

## Quick Reference

### Run test locally:
```bash
pnpm run test:dev-menu
```

### Check CI status:
```bash
gh run list --workflow=e2e-dev-unlock.yml --limit 5
```

### View latest CI run:
```bash
gh run view --web
```

### Download artifacts:
```bash
gh run download <run-id> -n playwright-report-dev
```

---

**Last Updated**: October 6, 2025
**Maintained By**: Development Team
