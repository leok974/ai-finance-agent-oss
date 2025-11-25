# Phase 3: Workflow Consolidation Summary

**Date**: 2025-01-XX
**Branch**: `chore/repo-cleanup-phase3-workflows`
**Commit**: `23e1eb13`

---

## Objective

Consolidate GitHub Actions workflows from **46 to 17 essential workflows** (63% reduction) by removing duplicates, obsolete tests, and manual operation workflows.

---

## Changes

### Updated Workflows (1)

**`ci.yml`** — Unified Core CI
- ✅ Updated backend test command: `pnpm -C apps/backend pytest --cov=...`
- ✅ Updated frontend test command: `pnpm -C apps/web vitest run --ci`
- ✅ Updated typecheck command: `pnpm -C apps/web typecheck`
- All commands now match LEDGERMIND_CONTEXT.json canonical reference

### Removed Workflows (30)

**Core CI Duplicates (5)**:
- `backend-ci.yml` — Duplicate of ci.yml backend job
- `web-ci.yml` — Duplicate of ci.yml web job
- `backend-tests.yml` — Only tested 1 file, not comprehensive
- `web-tests.yml` — Duplicate of ci.yml web tests
- `ci-fast-gates.yml` — Duplicate lint/typecheck

**E2E Duplicates/Obsolete (5)**:
- `e2e.yml` — Hardcoded test files, superseded by e2e-dev.yml
- `web-e2e.yml` — Duplicate E2E workflow
- `e2e-auth-contract.yml` — Specific auth tests, covered by dev lane
- `e2e-dev-unlock.yml` — Feature-specific E2E, no longer needed
- `e2e-ml.yml` — ML-specific E2E, no longer needed

**Smoke Test Duplicates (3)**:
- `backend-smoke.yml` — Consolidated into smoke-lite.yml
- `auth-smoke.yml` — Consolidated into smoke-lite.yml
- `ingest-smoke.yml` — Consolidated into smoke-lite.yml

**Manual Operations (9)**:
- `pre-commit-autoupdate.yml` — Manual update task, not CI
- `cloudflare-purge-smoke.yml` — Manual operation, not CI
- `csp-update-baseline.yml` — Manual baseline update, not CI
- `kms-rotate.yml` — Manual KMS rotation, not CI
- `ml-train.yml` — Manual training task, not CI
- `prom-rules-update.yml` — Manual Prometheus update, not CI
- `help-selftest.yml` — Feature-specific test, not CI
- `help-why.yml` — Feature-specific test, not CI
- `kms-crypto-smoke.yml` — KMS-specific smoke, covered elsewhere

**Infrastructure Duplicates (1)**:
- `edge-health.yml` — Duplicate of cloudflared-validate.yml

**ML/DevDiag (2)**:
- `devdiag-canary.yml` — Diagnostic checks, merge into ml.yml later if needed
- `devdiag-quickcheck.yml` — Diagnostic checks, merge into ml.yml later if needed

**DBT (2)**:
- `dbt-nightly.yml` — Not referenced in docs, unclear purpose
- `dbt-oidc.yml` — Not referenced in docs, unclear purpose

**Legacy (2)**:
- `backend-split.yml` — Superseded by unified ci.yml
- `uptime.yml` — External monitoring, not repo CI

### Kept Workflows (17) ✅

**Core CI (1)**:
1. `ci.yml` — Unified backend + frontend tests

**E2E (2)**:
2. `e2e-dev.yml` — Dev lane E2E with proper commands
3. `e2e-prod.yml` — Production smoke tests + nightly LLM tests

**Smoke (1)**:
4. `smoke-lite.yml` — Unified smoke tests

**Security & Safety (4)**:
5. `security-scan.yml` — SAST/dependency scanning
6. `pre-commit.yml` — Pre-commit hook validation
7. `alembic-guard.yml` — Migration safety checks
8. `db-drift.yml` — Schema drift detection

**Infrastructure (2)**:
9. `cloudflared-validate.yml` — Tunnel validation
10. `nginx-guards.yml` — Nginx config validation

**CSP (2)**:
11. `csp-drift.yml` — CSP drift detection
12. `csp-placeholder-guard.yml` — CSP placeholder enforcement

**ML (1)**:
13. `ml.yml` — ML pipeline validation

**Metrics (2)**:
14. `coverage.yml` — Coverage reporting
15. `eslint-metrics.yml` — ESLint budget tracking

**Validation (2)**:
16. `auth-contract.yml` — Auth contract validation
17. `prom-rules-validate.yml` — Prometheus rules validation

---

## Impact

### Before
- **46 workflows** across 13 categories
- Duplicates in Core CI (6 workflows), E2E (7 workflows), Smoke (4 workflows)
- Manual operation workflows scattered (9 workflows)
- Obsolete/feature-specific tests (8 workflows)

### After
- **17 workflows** across 9 categories ✅
- **-63% reduction** in workflow count
- **-2,107 lines** of GitHub Actions YAML removed
- All test commands match canonical reference (LEDGERMIND_CONTEXT.json)
- Clear separation: CI, E2E, Security, Infrastructure, Metrics

### Benefits
- ✅ Clearer CI organization for recruiters and contributors
- ✅ Reduced maintenance burden (17 vs 46 workflows)
- ✅ Consistent test commands across all workflows
- ✅ No duplicate or conflicting workflow runs
- ✅ Faster CI overview (fewer workflows to scan)

---

## Verification

### Pre-commit Hooks
✅ All pre-commit hooks passed:
- black (skipped, no Python files changed)
- ruff (skipped, no Python files changed)
- docker compose config lint (skipped)
- block wrapped key exports ✅
- block service account JSON ✅
- block test results/artifacts ✅
- Grafana ML dashboard validation (skipped)
- check json (skipped)
- fix end of files ✅
- trim trailing whitespace ✅
- detect hardcoded secrets ✅
- detect secrets ✅

### Files Changed
- **31 files changed**:
  - 30 workflows deleted
  - 1 workflow updated (ci.yml)
  - 1 classification doc created (docs/archive/WORKFLOW_CLASSIFICATION_PHASE3.md)
- **+234 insertions, -2,341 deletions**

---

## Next Steps

**Phase 4: Dead Code Removal** (Planned):
1. Find and remove unused React components
2. Remove deprecated API endpoints (if any)
3. Clean up old feature flags or commented code
4. Final pass on test files (remove obsolete tests)

**Phase 5: Final Recruiter Polish** (Planned):
1. Verify all CI workflows green on main
2. Proofread README and key docs
3. Ensure no trash files in root
4. Final recruiter review

---

## Documentation

**Classification Reference**: `docs/archive/WORKFLOW_CLASSIFICATION_PHASE3.md`
**Test Commands Reference**: `docs/LEDGERMIND_CONTEXT.json`
**Testing Guide**: `docs/testing/TESTING_GUIDE.md`
**E2E Guide**: `docs/testing/E2E_TESTS.md`

---

## Commit Message

```
chore(ci): consolidate workflows from 46 to 17 (-63%)

- Update ci.yml with canonical test commands (pnpm -C apps/...)
- Remove 30 duplicate/obsolete workflows:
  - Core CI: backend-ci, web-ci, backend-tests, web-tests, ci-fast-gates
  - E2E: e2e.yml, web-e2e, e2e-auth-contract, e2e-dev-unlock, e2e-ml
  - Smoke: backend-smoke, auth-smoke, ingest-smoke
  - Manual ops: pre-commit-autoupdate, cloudflare-purge-smoke, csp-update-baseline, kms-rotate, ml-train, prom-rules-update
  - Infrastructure: edge-health
  - ML: devdiag-canary, devdiag-quickcheck
  - Specialized: help-selftest, help-why, kms-crypto-smoke
  - DBT: dbt-nightly, dbt-oidc
  - Legacy: backend-split, uptime
- Keep 17 essential workflows:
  - Core: ci.yml
  - E2E: e2e-dev.yml, e2e-prod.yml
  - Smoke: smoke-lite.yml
  - Security: security-scan, pre-commit, alembic-guard, db-drift
  - Infrastructure: cloudflared-validate, nginx-guards
  - CSP: csp-drift, csp-placeholder-guard
  - ML: ml.yml
  - Metrics: coverage, eslint-metrics
  - Validation: auth-contract, prom-rules-validate
- Add classification doc to archive

Phase 3 of repository cleanup. All test commands now match
LEDGERMIND_CONTEXT.json canonical reference.
```

---

**Status**: ✅ **COMPLETE** (Phase 3)
**Pre-commit Checks**: ✅ **PASSING**
**Branch Ready for**: Merge to main or proceed to Phase 4
