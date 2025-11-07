# GitHub Branch Protection - Required Checks Setup

**Purpose**: Prevent schema drift and test failures from reaching main branch
**Target Branch**: `main`
**Last Updated**: 2025-11-05

---

## Step-by-Step Instructions

### 1. Navigate to Branch Protection Settings

1. Go to: https://github.com/leok974/ai-finance-agent-oss/settings/branches
2. Find "Branch protection rules" section
3. Click "Add rule" or edit existing rule for `main`

### 2. Configure Rule for `main` Branch

**Branch name pattern**: `main`

#### Required Settings:

✅ **Require a pull request before merging**
- [x] Require approvals: 1
- [x] Dismiss stale pull request approvals when new commits are pushed
- [x] Require review from Code Owners (if CODEOWNERS file exists)

✅ **Require status checks to pass before merging**
- [x] Require branches to be up to date before merging

**Add required status checks** (search and select):
- [x] `pre-commit` (code formatting, linting)
- [x] `help-selftest` (RAG/Help agent integration tests)
- [x] `db-drift` (Schema drift checker) ← **NEW for ML Pipeline Phase 2.1**
- [x] `ml-smoke-test` (if configured as separate workflow)
- [x] `backend-tests` (Python backend unit/integration tests)
- [x] `web-tests` (Frontend tests with coverage)

✅ **Require conversation resolution before merging**
- [x] All conversations must be resolved

✅ **Include administrators**
- [x] Include administrators (recommended for consistency)

✅ **Restrict who can push to matching branches**
- (Optional) Add specific users/teams if needed

---

## Verifying Required Checks

After saving, verify by:

### Test with a Draft PR:

```bash
git checkout -b test-branch-protection
echo "# Test" >> README.md
git add README.md
git commit -m "test: verify branch protection"
git push origin test-branch-protection
```

Create PR → Should see "Required checks" section with:
- ⏳ Waiting for status checks (db-drift, help-selftest, etc.)
- 🔒 Merging is blocked until checks pass

---

## CI Workflow Names vs. Check Names

Sometimes the check name differs from workflow file name:

| Workflow File | Check Name in PR |
|---------------|------------------|
| `.github/workflows/db-drift.yml` | `Schema Drift Check` or `db-drift` |
| `.github/workflows/help-selftest.yml` | `Help Selftest` or `help-selftest` |
| `.github/workflows/backend-test.yml` | `Backend Tests` or `backend-tests` |
| `.github/workflows/web-test.yml` | `Web Tests` or `web-tests` |

**Find exact check name**:
1. Open a recent PR
2. Scroll to "Checks" section at bottom
3. Copy the exact name shown

---

## Current Required Checks (as of 2025-11-05)

Based on `.github/workflows/`:

1. ✅ **Schema Drift Check** (`db-drift.yml`)
   - Runs: On all PRs
   - Checks: Missing tables/columns, label table exists
   - Blocks: PRs with schema drift

2. ✅ **Help Selftest** (`help-selftest.yml`)
   - Runs: On all PRs
   - Checks: RAG pipeline, help agent integration
   - Already configured with `pull_request:` trigger

3. ✅ **Pre-commit Checks**
   - Runs: On all PRs
   - Checks: Formatting, linting, type checks

4. ⏳ **ML Smoke Test** (optional, if separate workflow)
   - Could add: `.github/workflows/ml-smoke.yml`
   - Would check: Merchant labeler loads, suggest_auto works

5. ✅ **Backend Tests** (hermetic)
   - Runs: Python unit/integration tests
   - Coverage: Backend services

6. ✅ **Web Tests** (coverage)
   - Runs: Frontend tests with coverage
   - Coverage: React components, utilities

---

## Adding New Required Check (Example: ML Smoke Test)

If you create a new workflow `.github/workflows/ml-smoke.yml`:

```yaml
name: ML Smoke Test

on:
  pull_request:
    paths:
      - 'apps/backend/app/services/suggest/**'
      - 'apps/backend/app/orm_models.py'
      - 'apps/backend/alembic/versions/**'

jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run ML smoke test
        run: |
          cd apps/backend
          docker compose exec backend python -m app.drift_check
          docker compose exec backend python -c "from app.services.suggest.merchant_labeler import majority_for_merchant; print('✅ OK')"
```

Then add "ML Smoke Test" to required checks in branch protection settings.

---

## Troubleshooting

### Check not appearing in required status list

**Cause**: Workflow hasn't run on any PR yet
**Solution**:
1. Create a test PR that triggers the workflow
2. Once it runs, the check name will appear in autocomplete
3. Select it and save branch protection rule

### Check shows as "pending" forever

**Cause**: Workflow not triggered on this PR (path filters exclude changes)
**Solution**:
1. Review `on.pull_request.paths` in workflow file
2. Either broaden paths or remove filter for critical checks
3. For db-drift: Should run on **all** PRs (no path filter)

### PRs blocked even though checks pass

**Cause**: "Require branches to be up to date" is checked
**Solution**:
1. Rebase/merge main into PR branch
2. Or uncheck this setting (not recommended for critical branches)

---

## Maintenance

### Quarterly Review
- [ ] Verify all critical checks are still required
- [ ] Remove deprecated checks
- [ ] Add new checks for critical features

### After Major Changes
- [ ] ML Pipeline updates → Ensure db-drift is required
- [ ] Schema migrations → Run drift check manually before PR
- [ ] New integrations → Add corresponding CI check

---

## Reference Links

- **Branch Protection Docs**: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- **Status Checks**: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks
- **Our Workflows**: `.github/workflows/`

---

## Checklist for This Setup

- [x] Create `db-drift.yml` workflow
- [x] Verify workflow triggers on PRs
- [ ] **Navigate to GitHub settings and add required checks** ← **ACTION NEEDED**
- [ ] Test with a draft PR
- [ ] Document in team runbook
- [ ] Add to onboarding checklist

**Next**: Go to https://github.com/leok974/ai-finance-agent-oss/settings/branches and add the checks!
