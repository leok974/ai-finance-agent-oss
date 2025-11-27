# LedgerMind Architecture

_Last updated: 2025-11-27 (post repo cleanup + branch prune)_

LedgerMind is a full-stack personal finance and analytics app with:

- **FastAPI backend** for ingest, ML suggestions, RAG, and admin tooling
- **Vite/React frontend** (ChatDock v2 + dashboard)
- **Postgres + pgvector** for transactions, rules, and embeddings
- **Nginx + Cloudflare Tunnel** for static hosting, API proxying, and TLS
- **Scripts + CI** for local dev, tests, and production deployment

This document explains how those pieces fit together and how the new folder layout maps to the architecture.

---

## 1. High-Level System Overview

**Runtime topology (prod):**

```text
Browser (app.ledger-mind.org)
        │
        ▼
Cloudflare (DNS + WAF + TLS)
        │
        ▼
Cloudflare Tunnel (cloudflared)
        │
        ▼
Nginx (infra/deploy, infra/nginx)
  ├─ serves SPA (apps/web build output)
  └─ proxies API paths to FastAPI backend
        │
        ▼
FastAPI backend (apps/backend)
  ├─ Ingest CSV / demo data
  ├─ Transactions, rules, categories, ML suggestions
  ├─ RAG / pgvector search
  └─ Admin & maintenance endpoints
        │
        ▼
Postgres (+ pgvector) database
```

**Key routing:**

- Static assets & SPA shell are served directly by Nginx from the built `apps/web` bundle.
- API paths like `/agent/*`, `/auth/*`, `/rules/*`, `/ingest/*` are proxied from Nginx to the FastAPI backend over the internal Docker network.
- Cloudflare Tunnel exposes Nginx publicly via `app.ledger-mind.org` without opening ports on the host.

---

## 2. Core Components

### 2.1 Frontend (apps/web)

**Tech stack:**

- Vite + React + TypeScript
- TailwindCSS + custom chat/dash styles
- React Query / hooks for data fetching
- ChatDock v2 panel for agent interactions

**Main responsibilities:**

- CSV upload + demo data UI
- Dashboard: charts, top merchants, categories, unknowns
- Suggestions panel (ML/category suggestions, feedback)
- ChatDock overlay: agentic chat, contextual actions
- Auth flows and demo mode UX

**Build & deploy:**

- Built via Vite into a `dist/` bundle (JS, CSS, build.json, version.json).
- Nginx serves the SPA and `static assets/` from that bundle.

**Relevant directories:**

- `apps/web/src` – React app
- `apps/web/vite.config.*` – build configuration
- `assets/sample-data` – sample CSVs and related fixtures
- `docs/architecture/*` – front-end & ChatDock design notes

---

### 2.2 Backend (apps/backend)

**Tech stack:**

- FastAPI
- SQLAlchemy / Alembic
- Postgres + pgvector
- Optional local LLM / OpenAI integration for ML and RAG

**Main responsibilities:**

**Ingest & demo:**

- CSV ingest endpoints (`/ingest/*`)
- Demo seed/reset endpoints (`/demo/*`)
- Normalizing transactions, merchants, and categories

**Suggestions & ML:**

- Category suggestions based on rules + ML
- Unknowns / feedback loops
- RAG endpoints for merchant / vendor enrichment

**Auth & users:**

- Auth flows (Google or email, depending on config)
- Demo vs real user identity handling

**Admin & maintenance:**

- Health/ready/version endpoints
- Admin-only tools (rules promotion, unknowns triage)
- Background maintenance scripts (via `scripts/backend`)

**Relevant directories:**

- `apps/backend/app` – FastAPI application code
- `apps/backend/alembic` – DB migrations
- `scripts/backend` – DB/maintenance helpers
- `docs/ops` – runbooks, SLOs, deployment notes

---

### 2.3 Data Layer (Postgres + pgvector)

**Core tables (conceptual):**

- `users` – user accounts, demo vs real
- `transactions` – normalized ledger entries (amount, date, merchant, category, flags)
- `merchant_category_hints` / `rules` tables – rules + learned hints
- `ml_*` / `embeddings` – pgvector-backed tables for semantic search (RAG)
- `feedback` / `suggestions` – suggestion history, user feedback (accept/reject/undo)

**Responsibilities:**

- Durable storage of transactions, rules, and audit trails
- Efficient querying for dashboard and analytics
- Vector search to support RAG and smarter suggestions

---

### 2.4 Infra Layer (Nginx, Cloudflare Tunnel, Monitoring)

**Nginx (`infra/nginx`, `infra/deploy`):**

- Serves the built SPA & static assets from `/usr/share/nginx/html`.
- Proxies:
  - `/agent/*`, `/auth/*`, `/rules/*`, etc. → FastAPI backend.
  - `/version`, `/health`, `/ready` → health & build metadata.
- Adds security headers (CSP, HSTS, etc.) and CSP hashes at container startup.

**Cloudflare Tunnel (`infra/cloudflared`):**

- Tunnel config points hostnames (`app.ledger-mind.org`, etc.) to the internal nginx service on Docker's `infra_net` network.

**Monitoring & observability (`infra/monitoring`, `assets/grafana-panels`):**

- Prometheus config and scrape targets (depending on deployment).
- Grafana dashboards / JSON panel exports for:
  - API latency and error rates
  - Ingest and suggestions volume
  - Demo vs real usage patterns

---

## 3. Application Flows

### 3.1 CSV Ingest Flow

1. User uploads a CSV in the UI (`UploadCsv.tsx`).
2. Frontend calls ingest endpoint (`/ingest/csv` or similar).
3. Backend parses CSV, normalizes rows, stores them as transactions.
4. Dashboard queries re-run; charts and tables reflect new data.
5. Suggestions engine runs rules + ML to generate category suggestions.

---

### 3.2 Demo Mode & Reset

**Demo mode:**

- Demo data is seeded into a dedicated `DEMO_USER_ID` via `/demo/seed`.
- When demo mode is active, frontend uses `?demo=1` to query data for that user.
- Demo mode is stored in `localStorage` + context so http client knows which identity to hit.

**Reset behavior (post-fix):**

- Reset clears demo data and real user data in a safe order to avoid race conditions:
  1. Clear demo user transactions,
  2. Exit demo mode,
  3. Clear current user transactions,
  4. Refetch dashboard data.

This ensures:

- No demo leakage into real accounts.
- No "sticky" demo data after reset.
- CSV upload always happens in real mode.

---

### 3.3 Suggestions & Feedback

1. Backend suggestion service computes category suggestions for unknown/unlabeled transactions.
2. Frontend shows suggestions in a dedicated panel, with top-N options and reasons.
3. User actions (accept, reject, promote to rule, undo) are posted back.
4. Backend:
   - Updates `merchant_category_hints` / `rules`.
   - Stores feedback for future ML training.
   - Filters blocked suggestions from future results.

---

### 3.4 ChatDock v2 (Agent Panel)

- Chat overlay is a SPA component in `apps/web` that talks to the same backend via `/agent/*`.
- Nginx routes these requests to FastAPI; CSP is tuned to allow embedded chat without breaking security.
- Agent uses LedgerMind APIs + RAG to answer questions like:
  - "How much did I spend on food in October?"
  - "What are my top 3 merchants this month?"
  - "Explain why this suggestion was made."

---

## 4. Repository Layout (Post-Cleanup)

**Root (minimal):**

- `README.md`, `LICENSE`, `.gitignore`
- `docker-compose.*.yml` – dev/prod/e2e stacks
- `STRUCTURE_PLAN.md` – historical record of the big cleanup

**Applications:**

- `apps/backend` – FastAPI service, migrations, ML glue
- `apps/web` – React/Vite app + ChatDock

**Infra & deployment:**

- `infra/deploy` – Nginx Dockerfiles & entrypoint scripts
- `infra/nginx` – Nginx configuration and security headers
- `infra/cloudflared` – Cloudflare Tunnel config
- `infra/monitoring` – Prometheus/Grafana configs
- `infra/k8s` – (if present) Kubernetes manifests

**Docs:**

- `docs/architecture` – this file + chat/build/deploy design docs
- `docs/ops` – runbooks (deploy, rollback, SLOs, debugging)
- `docs/development` – AGENTS.md, structure plan, dev notes
- `docs/archive` – legacy docs kept for context

**Scripts & tools:**

- `scripts/infra` – deployment & prod scripts
- `scripts/dev` – local dev helpers, env bootstrap
- `scripts/testing` – smoke tests, e2e helpers
- `scripts/backend`, `scripts/web` – app-specific helpers
- `tools/*` – devdiag or other internal tools

**Config & assets:**

- `config/env-templates` – example env files (no real secrets)
- `config/{precommit,linting,testing,security}` – tool configs
- `assets/sample-data` – sample CSVs, demo datasets
- `assets/grafana-panels` – Grafana panel JSON

---

## 5. Environments & Deployment

**Typical prod deployment flow:**

1. Build backend and web images using Docker (or CI).
2. Use `docker-compose.prod.yml` to bring up:
   - `nginx` (web+proxy),
   - `backend`,
   - `postgres` (+ pgvector),
   - `cloudflared`,
   - optional monitoring stack.
3. Cloudflare Tunnel connects the nginx service to the public hostname(s).

**Health endpoints:**

- `/health` – simple OK
- `/ready` – readiness probe (app ready)
- `/version` – build metadata (branch, commit, build_id) for debugging.

---

## 6. How to Extend the System

**When adding new features:**

- **New API endpoints** → `apps/backend/app/routers/*`, update OpenAPI, add tests in `tests/backend/*`.
- **New UI features** → `apps/web/src/*`, keep components small and co-located with feature areas.
- **New infra/deploy tweaks** → `infra/deploy`, `infra/nginx`, `infra/cloudflared`, plus any relevant `docker-compose.*.yml`.
- **New operational docs / runbooks** → `docs/ops`.
- **New architecture decisions** → add ADR or notes in `docs/architecture`.

**Guideline for tools (Copilot / agents):**

- Do not move files out of `apps/`, `infra/`, `docs/`, `scripts`, `tests`, `config`, or `assets` unless explicitly requested.
- Assume the layout in this document is canonical.
- When in doubt, add docs under `docs/architecture` or `docs/development` instead of creating new root files.

---

**This architecture doc is meant to be a living file. When you make meaningful changes (new services, new data stores, new tunnels), update this document alongside the code.**
