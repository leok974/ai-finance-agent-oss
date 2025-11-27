# LedgerMind Repository Structure Cleanup Plan

**Date:** 2025-11-27
**Status:** ✅ **COMPLETE** - Structure reorganization and branch cleanup finished
**Goal:** Organize all files into logical folders, prune branches to main only

---

## Repo Layout — Canonical (Post-Cleanup 2025-11-27)

This structure is **canonical**. Do NOT re-flatten the repo or move things out of these roots.

Top-level rules:
- Root is minimal: `README.md`, `LICENSE`, `.gitignore`, `docker-compose.*.yml`, `package.json`, `STRUCTURE_PLAN.md`.
- Application code lives only in:
  - `apps/backend`  (FastAPI, DB, migrations)
  - `apps/web`      (Vite/React frontend)
- Infra lives in `infra/`:
  - `infra/deploy`      ← Dockerfiles, deploy configs (nginx, etc.)
  - `infra/cloudflared` ← Cloudflare Tunnel config
  - `infra/nginx`       ← nginx configs + entrypoint scripts
  - `infra/monitoring`  ← Prometheus/Grafana config
- Docs live in `docs/`:
  - `docs/architecture`  ← system & chat architecture (CHAT_* docs)
  - `docs/ops`           ← runbooks, SLOs, deployment guides
  - `docs/development`   ← AGENTS.md, structure plan, dev guides
  - `docs/archive`       ← old/legacy docs kept for reference
- Scripts live in `scripts/`:
  - `scripts/infra`      ← deploy/prod scripts
  - `scripts/dev`        ← local dev helpers
  - `scripts/testing`    ← smoke/e2e/test helpers
  - `scripts/backend`    ← backend maintenance/migration helpers
  - `scripts/web`        ← frontend/build helpers
- Tests live in `tests/`:
  - `tests/e2e`, `tests/integration`, `tests/fixtures`, etc.
- Config lives in `config/`:
  - `config/env-templates`  ← example env files only (no real secrets)
  - `config/precommit`, `config/linting`, `config/testing`, `config/security`
- Assets live in `assets/`:
  - `assets/sample-data`     ← demo CSVs and fixtures
  - `assets/grafana-panels`  ← saved dashboards/panels

Branch policy:
- `main` is the **only long-lived branch**.
- Feature branches must be short-lived, PR'd into `main`, and deleted after merge.
- Historical state is preserved via tags like `archive/pre-branch-cleanup-20251127`.

---

## Execution Summary

### Part 1: File Organization ✅
- **213 files reorganized** into logical hierarchy
- All `git mv` operations preserved history
- Docker compose paths updated (`infra/deploy/`, `infra/nginx/`)
- GitHub workflow script paths updated
- Pre-commit hooks reinstalled with new config location

### Part 2: Branch Cleanup ✅
- Safety tag created: `archive/pre-branch-cleanup-20251127`
- **Local branches:** 1 deleted (`fix/auth-401-upload-reset`)
- **Remote branches:** 46 deleted (all stale feature branches)
- **Result:** Only `main` branch remains (`git branch -a` shows only `origin/main`)

### Verification ✅
- ✅ Typecheck passes: `apps/web`
- ✅ Backend imports intact
- ✅ Docker compose build context valid
- ✅ Pre-commit hooks functional

**Rollback:** If needed, restore from tag: `git checkout archive/pre-branch-cleanup-20251127`

---

## Current State Analysis

**Root-level clutter identified:**
- 38 loose files (configs, logs, test data, workspace files, etc.)
- 23 directories (some organized, some scattered)
- 45+ remote branches (mostly stale feature branches)
- 2 local branches (main + fix/auth-401-upload-reset)

**Existing organized structure:**
- ✅ `apps/backend/` - FastAPI application
- ✅ `apps/web/` - Vite/React SPA
- ⚠️ `docs/archive/` - 225 archived docs (from DOCS_AUDIT.md)
- ⚠️ `scripts/` - 140+ scripts (mixed purposes)
- ⚠️ `infra/` - only contains eksctl-cluster.yaml
- ⚠️ `tests/` - needs organization

---

## Target Structure

```
/                           # Minimal root
  README.md                 # Main project README
  LICENSE                   # If exists
  .gitignore
  .gitattributes
  docker-compose.prod.yml   # Production compose (referenced by deploy scripts)
  docker-compose.dev.yml    # Development compose
  docker-compose.e2e.yml    # E2E testing compose
  Makefile                  # Top-level automation
  package.json              # Root pnpm workspace
  STRUCTURE_PLAN.md         # This file (will archive after execution)

  apps/
    backend/                # FastAPI app (no changes to internal structure)
    web/                    # Vite/React SPA (no changes to internal structure)

  infra/
    deploy/                 # Dockerfiles, deployment manifests
      Dockerfile.nginx
      ...
    cloudflared/            # Cloudflare Tunnel config
      config.yml
    nginx/                  # Nginx configs
      conf.d/
      entrypoint scripts
    k8s/                    # Kubernetes manifests (if any)
    monitoring/             # Prometheus, Grafana configs
      prometheus/
      grafana/

  docs/
    OVERVIEW.md             # Existing
    RELEASE_NOTES.md        # Existing
    INFRASTRUCTURE.md       # Existing
    DEBUGGING_GUIDE.md      # Existing
    architecture/           # System design docs
    product/                # Product/UX documentation
    ops/                    # Runbooks, deployment guides, postmortems
    development/            # Developer guides, setup instructions
    archive/                # Existing (225 archived docs)

  scripts/
    infra/                  # Infrastructure scripts (deploy, tunnel, cloudflare)
    backend/                # Backend maintenance (migrations, validation)
    web/                    # Web build scripts, asset deployment
    dev/                    # Development helpers (dev-stack, reset-venv)
    testing/                # Test runners, smoke tests, e2e
    monitoring/             # Monitoring setup, queries

  tests/
    e2e/                    # End-to-end tests (playwright)
    integration/            # Cross-app integration tests
    fixtures/               # Shared test data

  tools/
    devdiag/                # Development diagnostics tooling
    generators/             # Code generators, scaffolding
    validation/             # Validators (grafana, env, config)

  config/
    env-templates/          # .env.example files
    precommit/              # Pre-commit config
    linting/                # ruff, mypy configs
    ci/                     # CI-specific configs

  assets/
    sample-data/            # Sample CSV files
    diagrams/               # Architecture diagrams
    grafana-panels/         # Grafana panel JSON
```

---

## Detailed File Mappings

### Phase 1: Root Files → Organized Locations

#### Config Files (stay at root)
- ✅ `README.md` - KEEP
- ✅ `.gitignore` - KEEP
- ✅ `.gitattributes` - KEEP
- ✅ `docker-compose.prod.yml` - KEEP (referenced by deploy scripts)
- ✅ `docker-compose.dev.yml` - KEEP
- ✅ `docker-compose.e2e.yml` - KEEP
- ✅ `Makefile` - KEEP
- ✅ `package.json` - KEEP (pnpm workspace)

#### Config Files → config/
- `.env.example` → `config/env-templates/.env.example`
- `.env.prod.example` → `config/env-templates/.env.prod.example`
- `.env.local.example` → `config/env-templates/.env.local.example`
- `.env.test.template` → `config/env-templates/.env.test.template`
- `.pre-commit-config.yaml` → `config/precommit/.pre-commit-config.yaml`
- `ruff.toml` → `config/linting/ruff.toml`
- `mypy.ini` → `config/linting/mypy.ini`
- `pytest.ini` → `config/testing/pytest.ini`
- `.coveragerc` → `config/testing/.coveragerc`
- `.gitleaks.toml` → `config/security/.gitleaks.toml`
- `.secrets.baseline` → `config/security/.secrets.baseline`

#### Documentation → docs/
- `DOCS_AUDIT.md` → `docs/ops/DOCS_AUDIT.md`
- `DEMO_ASYNC_REFACTOR.md` → `docs/architecture/DEMO_ASYNC_REFACTOR.md`

#### Infrastructure → infra/
- `cloudflared/` → `infra/cloudflared/`
- `deploy/` → `infra/deploy/`
- `nginx/` → `infra/nginx/`
- `k8s/` → `infra/k8s/`
- `prometheus/` → `infra/monitoring/prometheus/`
- `eks-gpu.yaml` → `infra/k8s/eks-gpu.yaml`
- `eks-gpu-paid.yaml` → `infra/k8s/eks-gpu-paid.yaml`
- `eks-sys-cpu-ft.yaml` → `infra/k8s/eks-sys-cpu-ft.yaml`
- `nginx-simple.conf` → `infra/nginx/nginx-simple.conf`

#### Scripts (categorize by purpose)
Already in `scripts/` - needs subcategorization:
- Deploy scripts → `scripts/infra/`
- Dev scripts → `scripts/dev/`
- Test/smoke scripts → `scripts/testing/`
- Backend maintenance → `scripts/backend/`
- Web build → `scripts/web/`
- Monitoring → `scripts/monitoring/`

#### Sample Data & Assets → assets/
- `sample.csv` → `assets/sample-data/sample.csv`
- `error_bad_rows.csv` → `assets/sample-data/error_bad_rows.csv`
- `error_unknown_headers.csv` → `assets/sample-data/error_unknown_headers.csv`
- `grafana-panel-category-timeseries.json` → `assets/grafana-panels/category-timeseries.json`
- `grafana-panel-p2p-volume.json` → `assets/grafana-panels/p2p-volume.json`

#### Temp/Build Artifacts → DELETE or .gitignore
- `backend_full.log` → DELETE (build artifact)
- `test_app.sqlite` → DELETE (test artifact)
- `test_demo_seed.py` → Should be in apps/backend/tests/ (check if duplicate)
- `encryption_keys_snapshot.csv` → DELETE or move to secrets/
- `active-dek.json` → DELETE (secret, should not be in git)
- `active-dek.raw` → DELETE (secret)
- `active-dek-kms.raw` → DELETE (secret)
- `.coverage` → DELETE (coverage artifact)
- `bun.lock` → DELETE (not using Bun)
- `docker-compose.override.yml` → DELETE or .gitignore (local override)
- `docker-compose.prod.override.yml` → DELETE or .gitignore
- `docker-compose.prod.yml.bak` → DELETE (backup)
- `docker-compose.yml` → Clarify purpose vs .dev.yml
- `edge.html` → DELETE or move to assets/testing/
- `good-chat-css.txt` → DELETE (dev note)
- `headers-register.txt` → DELETE (dev note)
- `step2-wire-feedback.patch` → DELETE (old patch)
- `.cf-purge.last.json` → .gitignore (runtime file)

#### Workspace Files → .gitignore
- `LedgerMind.code-workspace` → .gitignore or keep at root
- `LedgerMind-infra.code-workspace` → .gitignore or keep at root

#### Top-level Directories

**Keep as-is:**
- ✅ `apps/` - core applications
- ✅ `.github/` - GitHub workflows, templates
- ✅ `.vscode/` - Editor settings

**Move/Reorganize:**
- `agents/` → `docs/development/agents/` (agent specs, not executable code)
- `assistant_api/` → Check if still used, archive or integrate
- `elysia-agui-gateway/` → Archive or move to apps/ if active
- `hackathon/` → `docs/archive/hackathon/`
- `warehouse/` → Clarify: is this active? Move to apps/ or archive
- `ops/` → Merge into `docs/ops/` and `scripts/monitoring/`
- `kb/` → `docs/product/kb/` or `docs/development/kb/`
- `security/` → Merge into `config/security/` and `docs/ops/security/`
- `data/` → Check contents, likely .gitignore or assets/test-data/
- `artifacts/` → .gitignore (build artifacts)
- `aws-audit-20251106_1755/` → DELETE (one-time audit)
- `secrets/` → Should NOT be in git - ensure .gitignored

---

## Phase 2: Script Reorganization

Current `scripts/` (140+ files) needs subcategorization:

### scripts/infra/
```
deploy-*.ps1, deploy-*.sh
cloudflare-*.ps1
cf-*.ps1, cf-*.js
tunnel-*.ps1, tunnel-*.sh
nginx-*.ps1
docker-*.ps1
cleanup-nginx-orphans.*
dev-docker.ps1
rebuild-prod.ps1
prod-*.ps1, prod-*.sh
```

### scripts/dev/
```
dev.ps1, dev.sh
dev-stack.ps1
reset-venv.ps1
set-dev-password.ps1
dev-*.ps1
```

### scripts/testing/
```
smoke-*.ps1, smoke-*.sh, smoke-*.py
test-*.ps1
e2e.ps1, e2e.sh
run-e2e.ps1
run-playwright.ps1
start-backend-and-run-e2e.js
ci-*.ps1, ci-*.mjs
analytics-smoke.*
auth-test.ps1
verify-*.ps1, verify-*.sh
check-*.ps1, check-*.mjs
```

### scripts/backend/
```
generate_demo_data.py
map_rules_router.py
alembic_guard.py
```

### scripts/web/
```
build-web.ps1
deploy-web.ps1
deploy-avatars-prod.ps1
```

### scripts/monitoring/
```
start-monitoring-stack.ps1
validate_grafana_dashboard.py
validate-dashboards.ps1
devdiag.probe.*
llm-health.*
lm-health.ps1
report-latency.mjs
```

### scripts/tools/ (utilities)
```
clean-artifacts.mjs
csp-*.ps1, csp-*.mjs
crypto-drill.ps1
i18n-extract.ts
validate_help_panels.py
fix-readme-mojibake.ps1
edge-*.ps1
port-guard.ps1
safe-down.ps1
prune-docker.ps1
list-unused-ollama-volumes.ps1
```

---

## Phase 3: Update References

### Docker Compose Files
**Files:** `docker-compose.prod.yml`, `docker-compose.dev.yml`

Update paths:
- `deploy/Dockerfile.nginx` → `infra/deploy/Dockerfile.nginx`
- `nginx/conf.d/` → `infra/nginx/conf.d/`
- `cloudflared/config.yml` → `infra/cloudflared/config.yml`
- `prometheus/prometheus.yml` → `infra/monitoring/prometheus/prometheus.yml`

### GitHub Workflows
**Location:** `.github/workflows/*.yml`

Update script paths:
- `scripts/smoke-prod.ps1` → `scripts/testing/smoke-prod.ps1`
- `scripts/deploy-ledgermind-nginx.ps1` → `scripts/infra/deploy-ledgermind-nginx.ps1`
- `scripts/verify-production.ps1` → `scripts/testing/verify-production.ps1`

### Documentation Links
Search and replace in all `.md` files:
- `./CHAT_BUILD_AND_DEPLOY.md` → `./docs/architecture/CHAT_BUILD_AND_DEPLOY.md`
- `cloudflared/config.yml` → `infra/cloudflared/config.yml`
- Update relative links in moved docs

### Code Imports (if any)
Check for hardcoded paths in:
- Python scripts importing from `scripts/`
- TypeScript/JavaScript imports
- Shell script `source` statements

---

## Phase 4: Branch Cleanup

### Current Branches
**Local:** 2 branches
- ✅ `main` - KEEP
- ⚠️ `fix/auth-401-upload-reset` - Check if merged, then delete

**Remote:** 45+ branches
All stale feature branches, will delete after safety tag.

### Safety Measures
1. Create tag: `archive/pre-branch-cleanup-20251127`
2. Verify main is up-to-date
3. Check no open PRs depend on branches
4. Delete local branches except main
5. Delete remote branches except main
6. Prune stale remote references

### Branches to Delete (Remote)
```
origin/Agent-Improv-3
origin/Agent-and-ML-advancements
origin/Agent-chat-implementation
origin/Agent-tool-enhancements
origin/Agent-tools
origin/Agent-tools2
origin/Agetn-chat-Improv
origin/Data-training
origin/Export-features
origin/File-Cleanup
origin/GPT-improvements
origin/ML-advancement
origin/ML-improvement2
origin/More-data-and-features
origin/Polish
origin/Polish-backup-2025-09-24
origin/Polish-clean-history
origin/Security-features
origin/UI-fix
origin/UI-fix-globalmonth
origin/UI-update
origin/UI-upgrade
origin/Ui-Fix
origin/V1
origin/auth-restore
origin/chore/sqlite-safe-migrations-ack-smoke
origin/docs/chatdock-v2-baseline
origin/docs/team-notification-rulesets
origin/encryption
origin/feat/chart-readability-improvements
origin/feat/excel-upload-polish
origin/feat/preview-backfill-rules
origin/feature/demo-login
origin/fix/account-menu-layout
origin/fix/agent-api-422-401
origin/fix/auth-401-upload-reset
origin/fix/chat-iframe-csp
origin/fix/chat-panel-scroll-open
origin/fix/chatdock-overlay-v3
origin/fix/chatdock-panel-v2
origin/fix/chatdock-reset-b743
origin/ml-pipeline-2.0
origin/ml-pipeline-2.1
origin/restore-old
origin/restore/fd5ff34
origin/website-cleaning
```

---

## Execution Checklist

### Pre-Flight
- [ ] Verify main is current: `git pull origin main`
- [ ] Create safety tag: `git tag archive/pre-branch-cleanup-20251127`
- [ ] Push tag: `git push origin --tags`
- [ ] Backup .env files locally (not in git)

### Structure Creation
- [ ] Create target directories (docs/architecture, scripts/infra, etc.)
- [ ] Review STRUCTURE_PLAN.md mappings
- [ ] Confirm no critical files will be deleted

### File Moves (git mv)
- [ ] Move config files → config/
- [ ] Move infrastructure → infra/
- [ ] Move docs → docs/
- [ ] Move scripts → scripts/* (categorize)
- [ ] Move assets → assets/
- [ ] Reorganize tests → tests/
- [ ] Handle special cases (warehouse, agents, ops)

### Reference Updates
- [ ] Update docker-compose.*.yml paths
- [ ] Update .github/workflows/*.yml paths
- [ ] Update README.md links
- [ ] Update docs/ internal links
- [ ] Update script cross-references
- [ ] Update .pre-commit-config.yaml paths

### Testing
- [ ] Run backend tests: `cd apps/backend && pytest`
- [ ] Run web tests: `cd apps/web && pnpm test`
- [ ] Build images: `docker compose -f docker-compose.prod.yml build`
- [ ] Verify compose up: `docker compose -f docker-compose.prod.yml up -d`
- [ ] Run smoke tests: `scripts/testing/smoke-prod.ps1`

### Cleanup
- [ ] Delete build artifacts
- [ ] Delete secrets from git
- [ ] Update .gitignore
- [ ] Commit structure changes

### Branch Pruning
- [ ] Delete local branch: `git branch -D fix/auth-401-upload-reset`
- [ ] Delete all remote branches (scripted)
- [ ] Prune stale refs: `git fetch -p`
- [ ] Verify only main remains

### Final Validation
- [ ] `git branch` shows only main
- [ ] `git branch -r` shows only origin/main
- [ ] Tests pass
- [ ] Docker builds work
- [ ] Documentation links work
- [ ] Push final changes to main

---

## Rollback Plan

If issues arise:
1. Restore from tag: `git checkout archive/pre-branch-cleanup-20251127`
2. Create recovery branch: `git checkout -b recovery/structure-cleanup`
3. Fix issues, test, merge back to main

Git mv preserves history, so file history is intact even after moves.

---

## Notes

- **Critical:** Do NOT move or modify apps/backend/ or apps/web/ internal structure
- **Critical:** Update all path references before committing moves
- **Secrets:** Ensure secrets/ and *.env.* are in .gitignore
- **Workspace files:** Can stay at root or be .gitignored (personal preference)
- **Docker context:** Verify build contexts still work after moves

---

**Status:** ✅ Plan Complete - Ready for Execution
