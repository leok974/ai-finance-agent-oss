# AI Agents & Copilot Guide

_Last updated: 2025-11-27_

This document tells AI tools (GitHub Copilot, ChatGPT, etc.) **how to behave in this repo**:

- Where code and docs live
- What they are allowed to change
- What they should **never** move or delete
- How to propose bigger refactors safely

Think of this as the "house rules" for assistants.

---

## 1. Repo Layout (Canonical)

The current structure is **intentional** and should be treated as **canonical**.

Top-level:

- `apps/` – application code
  - `apps/backend` – FastAPI backend, DB models, Alembic, ML glue
  - `apps/web` – Vite/React frontend + ChatDock
- `infra/` – deployment & infrastructure
  - `infra/deploy` – Dockerfiles, container entrypoints
  - `infra/nginx` – Nginx configs and security headers
  - `infra/cloudflared` – Cloudflare Tunnel config
  - `infra/monitoring` – Prometheus/Grafana config
- `docs/`
  - `docs/architecture` – system design, build/deploy docs, ARCHITECTURE.md
  - `docs/ops` – runbooks, SLOs, deployment + debugging
  - `docs/development` – this file, STRUCTURE_PLAN, dev notes
  - `docs/archive` – legacy docs kept for reference
- `scripts/`
  - `scripts/infra` – deploy/prod scripts
  - `scripts/dev` – local dev helpers
  - `scripts/testing` – smoke/e2e/test helpers
  - `scripts/backend` – backend utilities
  - `scripts/web` – frontend utilities
  - `scripts/monitoring`, `scripts/tools` – misc helpers
- `tests/` – e2e / integration / extra test harnesses
- `config/`
  - `config/env-templates` – example env files (no real secrets)
  - `config/{precommit,linting,testing,security}` – tool configs
- `assets/`
  - `assets/sample-data` – demo CSVs and fixtures
  - `assets/grafana-panels` – Grafana panel JSON
- Root –
  - `README.md`, `LICENSE`, `.gitignore`
  - `docker-compose.*.yml`
  - `STRUCTURE_PLAN.md` (historical record of cleanup)

> **Rule for agents:**
> Do **not** create new top-level directories or scatter files at root. Use the existing buckets above.

---

## 🔒 CRITICAL: Immutable Architecture Constraints

**These rules are LOCKED and must NEVER be violated:**

### OAuth & Demo User Separation

See **[docs/architecture/OAUTH_CONSTRAINTS.md](../architecture/OAUTH_CONSTRAINTS.md)** for complete constraints.

**Summary of Non-Negotiable Rules:**

1. **Demo users NEVER link to OAuth**
   - User ID 1 (`demo@ledger-mind.local`) has `is_demo=true`, `is_demo_user=true`
   - NO `OAuthAccount` records allowed for demo users
   - Any attempt to link OAuth to demo user MUST raise HTTPException 400

2. **OAuth resolution order is FIXED:**
   - Step 1: Lookup by (`provider`, `provider_user_id`)
   - Step 2: Match existing **non-demo** user by email
   - Step 3: Create new user (never demo) + OAuthAccount
   - This order CANNOT be changed

3. **Database constraints MUST be maintained:**
   - `UniqueConstraint("provider", "provider_user_id")` on `oauth_accounts`
   - Migration `20251127_fix_demo_user.py` preserves demo user identity
   - User ID 1 stays demo forever, never gets OAuth

4. **All 9 OAuth tests MUST pass:**
   - File: `apps/backend/app/tests/test_auth_google_oauth.py`
   - No OAuth changes allowed without extending tests
   - Coverage: reuse, linking, new users, demo protection, security

5. **Frontend email display rules:**
   - ONLY use email from `/api/auth/me`
   - NEVER hardcode emails
   - Gmail for OAuth users, `demo@ledger-mind.local` for demo

**Before ANY OAuth changes, read OAUTH_CONSTRAINTS.md in full.**

---

## 2. What Agents *Can* Do

Agents are welcome to:

- **Backend**
  - Add / modify FastAPI endpoints in `apps/backend/app/routers/*`
  - Add services, models, schemas under `apps/backend/app`
  - Add migrations in `apps/backend/alembic/versions`
  - Add backend tests in `tests/backend` (or equivalent)

- **Frontend**
  - Add React components under `apps/web/src`
  - Add hooks, utilities, and context providers within `apps/web/src`
  - Add/update tests (unit/Vitest) adjacent to components or under `tests/web`

- **Infra**
  - Update Nginx config under `infra/nginx` to add routes, tighten security, or wire new endpoints
  - Adjust Dockerfiles under `infra/deploy`
  - Update Cloudflare Tunnel config under `infra/cloudflared` (but not secrets)

- **Docs**
  - Add new architecture notes under `docs/architecture`
  - Add new runbooks under `docs/ops`
  - Add dev notes/checklists under `docs/development`

- **Scripts / Tools**
  - Add helper scripts under `scripts/*`
  - Add small internal tools under `tools/*`

---

## 3. What Agents **Must Not** Do (without explicit request)

**Do NOT:**

1. **Restructure the repo** again
   - Don't move directories like `apps/`, `infra/`, `docs/`, `scripts/`, `tests/`, `config/`, `assets/`.
   - Don't create "alternative" layouts (e.g., moving everything into `/src`).

2. **Delete or rename core infra**:
   - `docker-compose.*.yml`
   - `infra/deploy/*` Dockerfiles
   - `infra/nginx/*` configs
   - `infra/cloudflared/*` tunnel configs

3. **Touch secrets**
   - Never create or commit real `.env` files.
   - Only manage templates in `config/env-templates`.
   - Never hard-code tokens, keys, or passwords.

4. **Change branch policy**
   - Repo is single-branch: `main` only (short-lived feature branches OK, deleted after merge).
   - Do not reintroduce long-lived side branches by default.

5. **Break build / CI / tests on purpose**
   - Any larger change should keep `docker-compose.prod.yml` working.
   - Tests and typecheck are expected to pass, or failures must be clearly documented with a plan.

If a change would violate these rules, the assistant should **propose it in a doc** (e.g., new ADR in `docs/architecture`) instead of applying it directly.

---

## 4. Patterns & Preferences

### 4.1 Backend (FastAPI)

- Use **FastAPI routers** with dependency injection for DB and auth.
- Keep endpoints typed (Pydantic models or dataclasses).
- New features should:
  - Add router endpoints,
  - Add tests (pytest),
  - Update/run migrations if DB schema changes.

### 4.2 Frontend (React/Vite)

- Functional components, hooks, and small composable pieces.
- Prefer:
  - Feature-oriented organization: group related components/hooks.
  - Co-locate tests with components or under `tests/web`.

### 4.3 Scripts & Automation

- Use `scripts/infra` for any deploy-related new script.
- Use `scripts/dev` for local workflows (setup, seed, smoke).
- All new scripts should:
  - Be idempotent when possible,
  - Have comments explaining purpose and usage.

---

## 5. Bigger Changes: How to Propose Safely

If you want to introduce a **bigger change** (new service, major refactor, new ML flow):

1. **Write a short design doc** under `docs/architecture/`:
   - Name it `ADR-XXXX-something.md` or `PHASE-XX-feature-name.md`.
   - Include: problem, proposal, risks, rollout plan.

2. **Add a brief checklist** in the doc:
   - Code changes
   - Tests
   - Docs
   - Infra / deploy updates

3. Only after that, make code changes referencing that doc.

---

## 6. Minimal Context for External Agents

When using external LLMs / agents (e.g., Copilot Agents, ChatGPT with repo context), you can give them this minimal JSON context:

```json
{
  "project": "LedgerMind",
  "branch_model": "single-main",
  "layout": {
    "backend": "apps/backend",
    "frontend": "apps/web",
    "infra": "infra",
    "docs": "docs",
    "scripts": "scripts",
    "tests": "tests",
    "config": "config",
    "assets": "assets"
  },
  "rules": {
    "no_repo_restructure": true,
    "no_secret_files": true,
    "respect_infra_paths": true,
    "add_docs_for_big_changes": true
  }
}
```

This tells the agent:

- Where things live
- That it must respect the current structure
- That big changes need docs

---

## 7. How to Ask This Repo for Help (Template Prompts)

Some example prompts you can paste into Copilot / ChatGPT:

**Add a new backend endpoint:**

```
Add a FastAPI endpoint under apps/backend/app/routers to expose the X feature.
Follow existing patterns for auth and DB deps.
Add tests under tests/backend.
Update any relevant docs under docs/architecture or docs/ops.
```

**Add a new dashboard card:**

```
In apps/web, add a new dashboard card that shows X.
Integrate with existing API calls (re-use Http client).
Add state + hooks next to similar components.
Add a basic unit test.
Do not change the project structure.
```

**Update infra safely:**

```
Update the Nginx config under infra/nginx to support route X.
Make sure existing routes keep working.
If docker-compose paths change, update docker-compose.prod.yml accordingly.
Don't move infra directories.
```

---

## Additional References

- **API Path Rules:** See `.github/copilot-instructions.md` for frontend API conventions
- **Docker Build Context:**
  - Backend: `apps/backend/Dockerfile` (build context: repo root)
  - Web: `infra/deploy/Dockerfile.nginx` (build context: repo root)
- **Pre-Commit Hooks:** `config/precommit/.pre-commit-config.yaml`
- **Production Deployment:** See `DEPLOY_PROD.md` for full instructions
- **Architecture:** See `docs/architecture/ARCHITECTURE.md` for system design

---

**This file is meant to be a stable contract.**
**When you change the repo layout or policies, update AGENTS.md too so tools stay in sync.**
