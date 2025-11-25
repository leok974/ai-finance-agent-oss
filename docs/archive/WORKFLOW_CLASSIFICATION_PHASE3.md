# Workflow Classification – Phase 3 Cleanup

**Goal**: Reduce 46 workflows → ~10-15 essential workflows by consolidating duplicates and removing obsolete ones.

## Classification Legend

- **KEEP** — Essential workflow, modernize if needed
- **MERGE** — Consolidate into another workflow
- **REMOVE** — Obsolete or duplicate, safe to delete

---

## Core CI (3 workflows → 1 unified)

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `ci.yml` | **KEEP** | Modernize | Primary CI workflow, already runs both backend + web tests |
| `backend-ci.yml` | **MERGE → ci.yml** | Delete | Duplicate of ci.yml backend job, runs same tests |
| `web-ci.yml` | **MERGE → ci.yml** | Delete | Duplicate of ci.yml web job, runs same tests |
| `backend-tests.yml` | **REMOVE** | Delete | Only tests 1 file (test_agent_tools_suggestions.py), not comprehensive |
| `web-tests.yml` | **MERGE → ci.yml** | Delete | Duplicate of ci.yml web tests |
| `ci-fast-gates.yml` | **MERGE → ci.yml** | Delete | Duplicate lint/typecheck, already in web-ci.yml and ci.yml |

**Action**: Update `ci.yml` with canonical test commands, delete 5 duplicates.

---

## E2E Testing (7 workflows → 2 unified)

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `e2e.yml` | **REMOVE** | Delete | Hardcoded test files, superseded by e2e-dev.yml |
| `e2e-dev.yml` | **KEEP** | Modernize | Dev lane E2E with proper command (`test:fast:auto`) |
| `e2e-prod.yml` | **KEEP** | Keep as-is | Production smoke tests, nightly LLM tests, already correct |
| `web-e2e.yml` | **MERGE → e2e-dev.yml** | Delete | Duplicate E2E workflow |
| `e2e-auth-contract.yml` | **MERGE → e2e-dev.yml** | Delete | Specific auth tests, should be covered by dev lane |
| `e2e-dev-unlock.yml` | **REMOVE** | Delete | Feature-specific E2E, no longer needed |
| `e2e-ml.yml` | **REMOVE** | Delete | ML-specific E2E, no longer needed |

**Action**: Keep `e2e-dev.yml` and `e2e-prod.yml`, delete 5 others.

---

## Smoke Tests (4 workflows → 1 unified)

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `backend-smoke.yml` | **MERGE → smoke-lite.yml** | Delete | Backend-specific smoke tests |
| `auth-smoke.yml` | **MERGE → smoke-lite.yml** | Delete | Auth-specific smoke tests |
| `ingest-smoke.yml` | **MERGE → smoke-lite.yml** | Delete | Ingest-specific smoke tests |
| `smoke-lite.yml` | **KEEP** | Modernize | Unified smoke tests |

**Action**: Consolidate all smoke tests into `smoke-lite.yml`, delete 3 duplicates.

---

## Security & Safety (4 workflows → keep all)

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `security-scan.yml` | **KEEP** | Keep | SAST/dependency scanning |
| `pre-commit.yml` | **KEEP** | Keep | Pre-commit hook validation |
| `pre-commit-autoupdate.yml` | **REMOVE** | Delete | Manual operation, not needed in CI |
| `alembic-guard.yml` | **KEEP** | Keep | Migration safety checks |

**Action**: Keep 3 essential security workflows, remove autoupdate (manual task).

---

## Database (2 workflows → keep both)

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `alembic-guard.yml` | **KEEP** | Keep | Already counted in security |
| `db-drift.yml` | **KEEP** | Keep | Schema drift detection |

**Action**: Keep both.

---

## Infrastructure & Edge (4 workflows → 1)

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `cloudflare-purge-smoke.yml` | **REMOVE** | Delete | Manual operation, not needed in CI |
| `cloudflared-validate.yml` | **KEEP** | Keep | Tunnel validation |
| `edge-health.yml` | **MERGE → cloudflared-validate.yml** | Delete | Duplicate edge checks |
| `nginx-guards.yml` | **KEEP** | Keep | Nginx config validation |

**Action**: Keep cloudflared-validate and nginx-guards, delete 2 others.

---

## CSP (3 workflows → keep 2)

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `csp-drift.yml` | **KEEP** | Keep | CSP drift detection |
| `csp-placeholder-guard.yml` | **KEEP** | Keep | CSP placeholder enforcement |
| `csp-update-baseline.yml` | **REMOVE** | Delete | Manual baseline update, not CI |

**Action**: Keep 2 guards, remove manual update task.

---

## ML & DevDiag (4 workflows → 1)

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `ml.yml` | **KEEP** | Keep | ML pipeline validation |
| `ml-train.yml` | **REMOVE** | Delete | Manual training task, not CI |
| `devdiag-canary.yml` | **MERGE → ml.yml** | Delete | Diagnostic checks, merge into ml.yml |
| `devdiag-quickcheck.yml` | **MERGE → ml.yml** | Delete | Diagnostic checks, merge into ml.yml |

**Action**: Keep `ml.yml`, delete 3 others.

---

## Specialized (6 workflows → keep 2)

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `coverage.yml` | **KEEP** | Keep | Dedicated coverage reporting |
| `eslint-metrics.yml` | **KEEP** | Keep | ESLint budget tracking |
| `help-selftest.yml` | **REMOVE** | Delete | Feature-specific test, not CI |
| `help-why.yml` | **REMOVE** | Delete | Feature-specific test, not CI |
| `kms-crypto-smoke.yml` | **REMOVE** | Delete | KMS-specific smoke test, covered elsewhere |
| `kms-rotate.yml` | **REMOVE** | Delete | Manual operation, not CI |

**Action**: Keep coverage and eslint-metrics, delete 4 feature-specific tests.

---

## DBT (2 workflows → remove both)

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `dbt-nightly.yml` | **REMOVE** | Delete | Not referenced in docs, unclear purpose |
| `dbt-oidc.yml` | **REMOVE** | Delete | Not referenced in docs, unclear purpose |

**Action**: Remove both (no DBT mentioned in project docs).

---

## Auth (2 workflows → remove 1)

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `auth-contract.yml` | **KEEP** | Keep | Auth contract validation |
| `auth-smoke.yml` | **MERGE → smoke-lite.yml** | Delete | Already counted in smoke tests |

**Action**: Keep contract, merge smoke.

---

## Prometheus (2 workflows → keep 1)

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `prom-rules-update.yml` | **REMOVE** | Delete | Manual update task, not CI |
| `prom-rules-validate.yml` | **KEEP** | Keep | Prometheus rules validation |

**Action**: Keep validation, remove manual update.

---

## Legacy (2 workflows → remove both)

| File | Status | Action | Reason |
|------|--------|--------|--------|
| `backend-split.yml` | **REMOVE** | Delete | Superseded by unified ci.yml |
| `uptime.yml` | **REMOVE** | Delete | External monitoring, not repo CI |

**Action**: Remove both.

---

## Summary

### Before (46 workflows)
- Core CI: 6 workflows
- E2E: 7 workflows
- Smoke: 4 workflows
- Security: 4 workflows
- Database: 2 workflows
- Infrastructure: 4 workflows
- CSP: 3 workflows
- ML: 4 workflows
- Specialized: 6 workflows
- DBT: 2 workflows
- Auth: 2 workflows
- Prometheus: 2 workflows
- Legacy: 2 workflows

### After (15 workflows) ✅

**Keep (15 total)**:
1. `ci.yml` — Unified backend + frontend CI
2. `e2e-dev.yml` — Dev lane E2E
3. `e2e-prod.yml` — Production smoke tests + nightly LLM
4. `smoke-lite.yml` — Unified smoke tests
5. `security-scan.yml` — SAST/dependency scan
6. `pre-commit.yml` — Pre-commit validation
7. `alembic-guard.yml` — Migration safety
8. `db-drift.yml` — Schema drift detection
9. `cloudflared-validate.yml` — Tunnel validation
10. `nginx-guards.yml` — Nginx config validation
11. `csp-drift.yml` — CSP drift detection
12. `csp-placeholder-guard.yml` — CSP placeholder enforcement
13. `ml.yml` — ML pipeline validation
14. `coverage.yml` — Coverage reporting
15. `eslint-metrics.yml` — ESLint budget tracking
16. `auth-contract.yml` — Auth contract validation
17. `prom-rules-validate.yml` — Prometheus rules validation

**Remove (31 workflows)**: backend-ci.yml, web-ci.yml, backend-tests.yml, web-tests.yml, ci-fast-gates.yml, e2e.yml, web-e2e.yml, e2e-auth-contract.yml, e2e-dev-unlock.yml, e2e-ml.yml, backend-smoke.yml, auth-smoke.yml, ingest-smoke.yml, pre-commit-autoupdate.yml, cloudflare-purge-smoke.yml, edge-health.yml, csp-update-baseline.yml, ml-train.yml, devdiag-canary.yml, devdiag-quickcheck.yml, help-selftest.yml, help-why.yml, kms-crypto-smoke.yml, kms-rotate.yml, dbt-nightly.yml, dbt-oidc.yml, prom-rules-update.yml, backend-split.yml, uptime.yml

**Reduction**: 46 → 17 workflows (63% reduction) ✅

---

## Next Steps

1. ✅ Create this classification document
2. ⏳ Update `ci.yml` with canonical test commands
3. ⏳ Consolidate smoke tests into `smoke-lite.yml`
4. ⏳ Update `ml.yml` with devdiag checks
5. ⏳ Delete 31 obsolete/duplicate workflows
6. ⏳ Commit in 2 groups:
   - Commit 1: "ci: unify core CI and e2e workflows"
   - Commit 2: "chore(ci): remove 31 obsolete/duplicate workflows"
