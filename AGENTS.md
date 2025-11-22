# LedgerMind Agents

This repo uses **specialist agents** instead of a single generalist.
Each agent has a focused scope, concrete commands it can run, and clear boundaries.

Use this file to pick the right agent and understand what it's allowed to do.

---

## How to use these agents

When you ask an agent for help:

1. **Pick the right specialist**
   - Backend & ML & RAG → `api-agent`
   - Tests & CI behavior → `test-agent`
   - Docs, runbooks, architecture → `docs-agent`
   - Local dev & Docker flows → `dev-deploy-agent`
   - Auth / CSP / secrets / SSRF → `security-agent`

2. **Be concrete**
   - Include file paths (e.g. `apps/backend/app/services/categorize_suggest.py`).
   - Say which environment you care about (dev vs prod).
   - Say whether this is a refactor, a bugfix, or a new feature.

3. **Respect boundaries**
   - Each agent defines:
     - ✅ **Always**: safe, routine changes
     - ⚠️ **Ask first**: needs explicit human approval
     - 🚫 **Never**: out of scope for automation

When in doubt, the agent should **propose** a plan or patch and ask for confirmation before any ⚠️ change.

---

## Available agents

### `api-agent` — Backend API, DB, ML & RAG

- **Scope**: FastAPI routes, services, models, DB access, ML suggestion engine, RAG/pgvector integration.
- **Use when**:
  - Adding or modifying API endpoints.
  - Adjusting categorize / suggestions scoring or logging.
  - Improving RAG ingestion or retrieval.
- **Key paths**:
  - `apps/backend/app/` (routers, services, models)
  - `apps/backend/alembic/` (migrations)
  - `apps/backend/app/tests/` (backend tests)

See: `agents/api-agent.md`

---

### `test-agent` — Vitest, Playwright, Pytest

- **Scope**: Frontend unit tests, E2E tests, backend tests, test data & fixtures.
- **Use when**:
  - Adding tests for new behavior.
  - Fixing flaky tests.
  - Aligning tests with the intended behavior.
- **Key paths**:
  - `apps/web/src/**/__tests__/**`
  - `apps/web/tests/e2e/**`
  - `apps/backend/app/tests/**`

See: `agents/test-agent.md`

---

### `docs-agent` — Docs, roadmaps, runbooks, architecture

- **Scope**: README files, architecture docs, roadmaps, runbooks, AGENTS docs.
- **Use when**:
  - Updating docs to match the current implementation.
  - Adding small "how to run this" or "how it works" sections.
  - Cleaning up drift between code and docs.

See: `agents/docs-agent.md`

---

### `dev-deploy-agent` — Dev stack, Docker, smoke tests

- **Scope**: Docker-based dev flow, local stacks, smoke tests, safe deployment notes.
- **Use when**:
  - Improving developer experience for running LedgerMind locally.
  - Adding or updating dev-only Docker Compose services.
  - Adding smoke tests or "one command" dev scripts.

See: `agents/dev-deploy-agent.md`

---

### `security-agent` — Auth, SSRF, secrets, policy

- **Scope**: Authentication, authorization, CSRF/CORS, SSRF protections, secret handling, security docs.
- **Use when**:
  - Tightening security controls.
  - Reviewing changes that touch auth, CSP, CSRF, SSRF, or secrets.
  - Writing/maintaining security-related docs and checklists.

See: `agents/security-agent.md`

---

## Key Features & Endpoints

### Manual Categorization with Undo

**Backend Endpoints:**
- `POST /transactions/{txn_id}/categorize/manual` — Manually categorize a transaction with scope options
  - Scopes: `just_this`, `same_merchant`, `same_description`
  - Returns `ManualCategorizeResponse` with `affected` array (transaction snapshots for undo)
- `POST /transactions/categorize/manual/undo` — Safely revert a bulk categorization
  - Accepts `affected` array from previous categorize response
  - Safety rule: only reverts transactions that still have the bulk-applied category
  - User-isolated: only touches the current user's transactions

**Frontend Surfaces:**
- **ExplainSignalDrawer** (`apps/web/src/components/ExplainSignalDrawer.tsx`)
  - Manual categorization form for unknown transactions
  - Saves last change to localStorage (`lm:lastManualCategorize`)
- **ManualCategorizeSettingsDrawer** (`apps/web/src/components/ManualCategorizeSettingsDrawer.tsx`)
  - Accessed via Settings → "Manual categorization"
  - Shows last bulk change with affected transaction list
  - "Undo this change" button for safe revert
  - Clears localStorage after successful undo

**Safety Pattern:**
Undo only reverts rows where `current_category == new_category_slug` from the bulk operation.
If a user has manually recategorized a transaction since the bulk change, it won't be touched.

---

## Canonical commands

These are the **baseline commands** agents should use unless the repo docs specify a better variant.

- **Frontend unit tests (Vitest)**
  `pnpm -C apps/web vitest run`

- **Frontend e2e tests (Playwright)**
  `pnpm -C apps/web exec playwright test`

- **Backend tests (Pytest)**
  Prefer: `pnpm -C apps/backend pytest -q`
  Or (inside backend env): `pytest -q`

- **Backend dev server (FastAPI)**
  `uvicorn apps.backend.app.main:app --reload`

- **Migrations (Alembic)**
  `python -m alembic -c apps/backend/alembic.ini upgrade head`

- **Dev stack (Docker)**
  `docker compose up -d` (dev-only; never adjust prod stack without approval)

Agents must **mirror the repo's reality**: if a README or script uses a slightly different command, follow that instead and update this doc via `docs-agent`.

---

## Global boundaries

These apply to **all agents**:

- 🚫 **Never**
  - Change prod routing, secrets, Cloudflare Tunnel config, or nginx upstreams.
  - Loosen auth / CSP / CSRF / SSRF / allowlist guards.
  - Bypass or weaken admin-only approval endpoints (the human owner is the sole admin).

- ⚠️ **Ask first**
  - Any behavior change visible to production users.
  - Any change to model schemas, training code, or how ML/RAG is rolled out.
  - Any modification of cookie / CORS domains or session handling.

- ✅ **Always**
  - Improve logging, docs, and tests.
  - Refactor for clarity without changing behavior.
  - Add small, dev-only utilities guarded by existing safety patterns.

For anything under ⚠️, the agent should propose a plan or PR diff and explicitly ask the human whether to proceed.
