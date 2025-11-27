# AI Agent Guardrails & Guidelines

This document provides canonical instructions for AI assistants (Copilot, ChatGPT, etc.) working in this repository.

---

## Repository Structure — DO NOT MODIFY

> **Copilot: When touching repo structure, do NOT move files out of `apps/`, `infra/`, `docs/`, `scripts/`, `tests/`, `config/`, or `assets/` unless explicitly asked. Assume this layout is intentional and permanent.**

### Canonical Layout (Post-Cleanup 2025-11-27)

This structure is **canonical**. Do NOT re-flatten the repo or move things out of these roots.

**Top-level rules:**
- Root is minimal: `README.md`, `LICENSE`, `.gitignore`, `docker-compose.*.yml`, `package.json`, `STRUCTURE_PLAN.md`.
- Application code lives only in:
  - `apps/backend`  (FastAPI, DB, migrations)
  - `apps/web`      (Vite/React frontend)

**Infrastructure** lives in `infra/`:
- `infra/deploy`      ← Dockerfiles, deploy configs (nginx, etc.)
- `infra/cloudflared` ← Cloudflare Tunnel config
- `infra/nginx`       ← nginx configs + entrypoint scripts
- `infra/monitoring`  ← Prometheus/Grafana config

**Documentation** lives in `docs/`:
- `docs/architecture`  ← system & chat architecture (CHAT_* docs)
- `docs/ops`           ← runbooks, SLOs, deployment guides
- `docs/development`   ← AGENTS.md, structure plan, dev guides
- `docs/archive`       ← old/legacy docs kept for reference

**Scripts** live in `scripts/`:
- `scripts/infra`      ← deploy/prod scripts
- `scripts/dev`        ← local dev helpers
- `scripts/testing`    ← smoke/e2e/test helpers
- `scripts/backend`    ← backend maintenance/migration helpers
- `scripts/web`        ← frontend/build helpers

**Tests** live in `tests/`:
- `tests/e2e`, `tests/integration`, `tests/fixtures`, etc.

**Config** lives in `config/`:
- `config/env-templates`  ← example env files only (no real secrets)
- `config/precommit`, `config/linting`, `config/testing`, `config/security`

**Assets** live in `assets/`:
- `assets/sample-data`     ← demo CSVs and fixtures
- `assets/grafana-panels`  ← saved dashboards/panels

**Branch policy:**
- `main` is the **only long-lived branch**.
- Feature branches must be short-lived, PR'd into `main`, and deleted after merge.
- Historical state is preserved via tags like `archive/pre-branch-cleanup-20251127`.

---

## Docker Build Context Rules

**Backend:**
- Dockerfile: `apps/backend/Dockerfile`
- Build context: Repository root (`.`)
- Paths must be prefixed: `COPY apps/backend/requirements.txt ./`

**Web:**
- Dockerfile: `infra/deploy/Dockerfile.nginx`
- Build context: Repository root (`.`)
- Paths must be prefixed: `COPY ./infra/deploy/nginx.conf`, `COPY apps/web/src ./src`

---

## API Path Rules (Frontend)

See `.github/copilot-instructions.md` for detailed API path conventions. Key points:

1. **DO NOT** hardcode `/api/` in new code except for `/api/auth/*` endpoints.
2. All non-auth API calls use relative paths: `rules`, `charts/month-flows`, etc.
3. Use the shared helper `fetchJSON` from `src/lib/http.ts` for all network calls.
4. Respect `VITE_API_BASE` (defaults to `/`).
5. Chart endpoints use dash slugs: `charts/month-flows` (not `month_flows`).

---

## Agent-Specific Guidelines

Detailed agent instructions are in `docs/development/agents/`:
- `api-agent.md` — Backend API development guidelines
- `dev-deploy-agent.md` — Deployment and infrastructure tasks
- `docs-agent.md` — Documentation standards
- `security-agent.md` — Security best practices
- `test-agent.md` — Testing conventions

---

## Pre-Commit Hooks

Always run before commits. Config: `config/precommit/.pre-commit-config.yaml`

Install from new location:
```powershell
pre-commit install --config config/precommit/.pre-commit-config.yaml
```

---

## Production Deployment

See `DEPLOY_PROD.md` for full instructions. Quick reference:

1. Build images with commit hash:
   ```powershell
   $sha = git rev-parse --short=8 HEAD
   docker build -f apps/backend/Dockerfile -t ledgermind-backend:main-$sha .
   docker build -f infra/deploy/Dockerfile.nginx -t ledgermind-web:main-$sha .
   ```

2. Update `docker-compose.prod.yml` image tags (set `pull_policy: never`)

3. Deploy:
   ```powershell
   docker compose -f docker-compose.prod.yml up -d backend nginx
   ```

4. Verify:
   ```powershell
   curl http://localhost:8083/api/ready
   ```

---

## Rollback Instructions

If structure changes cause issues, rollback to pre-cleanup state:

```powershell
git checkout archive/pre-branch-cleanup-20251127
```

This tag preserves the repository state before the 2025-11-27 cleanup.
