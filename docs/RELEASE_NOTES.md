# LedgerMind – Release Notes

Major milestones and feature releases for LedgerMind.

---

## [2025-11-07] Documentation Consolidation

### Changed
- **Documentation restructure:** 366 markdown files consolidated into 5 core docs
  - `docs/OVERVIEW.md` — Architecture & system design
  - `docs/INFRASTRUCTURE.md` — Deployment & operations
  - `docs/DEBUGGING_GUIDE.md` — Troubleshooting & diagnostics
  - `docs/RELEASE_NOTES.md` — Major milestones (this file)
  - `README.md` — Recruiter-focused overview
- **README enhancements:** Added "For Recruiters & Hiring Managers" section
- **Legacy docs archived:** ~150 phase docs, deployment records moved to `docs/archive/`

### Impact
Repository now presents professionally to technical recruiters and hiring managers.

---

## [2025-11-05] ML Pipeline Phase 2.1 (Integration Complete)

### Added

**ML Categorization Pipeline:**
- **Schema-agnostic merchant-majority labeler** (support ≥3 txns, confidence ≥0.70)
- **Confidence gate** → "Ask the agent" path (threshold: 0.50)
- **Durable logging:** `suggestions.reason_json`, `source`, `model_version` persisted
- **Database schema:**
  - `suggestions` table: candidate categories with structured reasoning
  - `suggestion_events` table: accept/reject tracking for metrics
- **Reconciliation migration:** `20251105_reconcile_ml_schema` (safe adds only)
- **CI drift guard:** `.github/workflows/db-drift.yml` blocks PRs with schema drift

**API Enhancements:**
- `SuggestionCandidate` response includes structured reasons (List[Union[str, dict]])
- `POST /ml/suggestions/{id}/accept` — Idempotent accept endpoint
- `GET /ml/status` — Operational visibility (shadow/canary/calibration config)

**UI Features:**
- **SuggestionCard component:** Accept button, mode chips (rule/model/ask), collapsible reasoning viewer
- **Prometheus metric:** `lm_ml_suggestion_accepts_total{model_version, source, label}`

**Rollout Controls:**
- **Canary controls:** Makefile targets (`canary-0/10/50/100/status`) for gradual rollout
- **Backfill script:** `scripts/backfill_merchant_labels.sql` for top 50 merchants

**Testing:**
- **Golden set:** 20 transactions across 4 merchants (Amazon, Starbucks, Target, Whole Foods)
- **E2E smoke scripts:** Bash + PowerShell versions for accept flow validation
- **Playwright tests:** UI acceptance spec for suggestion card interactions

### Changed
- **Unified candidate pool:** Merchant majority → Heuristic rules → ML model
- **Merchant labeler:** Auto-detects `user_labels` vs `transaction_labels` (schema-agnostic)
- **SuggestionCard:** Enhanced with color-coded mode chips, max-height reasoning viewer

### Fixed
- **Database schema drift:** Added missing `suggestion_events` table
- **ORM relationship errors:** Commented broken `back_populates` in models
- **Accept endpoint idempotency:** Metric only increments when flipping `accepted` false → true

### Documentation
- `ML_DEPLOYMENT_COMPLETE.md` — Full integration summary
- `ML_PIPELINE_SMOKE_TEST.md` — Comprehensive test checklist
- `GRAFANA_ML_PANELS.md` — 4 Prometheus queries (Accept Rate, Top Accepts, Ask-Agent Rate, Canary Coverage)
- `ML_CANARY_RAMP_PLAYBOOK.md` — Rollout strategy (0% → 100%)
- `CANARY_RAMP_QUICKOPS.md` — Daily ops checklist
- `ML_E2E_SMOKE_TEST.md` — E2E validation guide
- `GITHUB_BRANCH_PROTECTION.md` — CI/CD required checks setup

---

## [2025-09-27] Initial Public Documentation Consolidation

### Added
- **KMS encryption:** `CRYPTO_SETUP.md` detailing GCP KMS envelope encryption
- **Cloudflare Tunnel guide:** `TROUBLESHOOTING_CLOUDFLARE_TUNNEL.md` (origin mismatch, QUIC fallback)
- **LLM setup:** `LLM_SETUP.md` (Ollama primary vs OpenAI fallback, `llmStore` model availability)
- **Smoke tests:** `SMOKE_TESTS.md` + cross-platform scripts for readiness gating
- **Production verification:** `VERIFY_PROD.md` and `DEPLOY_CHECKLIST.md`

### Changed
- **Cloudflare tunnel origin:** Normalized from `https://nginx:443` → `http://nginx:80` (eliminated 502s)
- **Frontend model management:** Introduced `llmStore` consolidating health checks, gating Explain/Rephrase features

### Security
- **KMS encryption activated:** Mode switched from `disabled` → `kms`
- **Service account:** Documented env requirements + IAM role setup

### Tooling
- **Hermetic test runner:** Adjustments ensuring isolated pytest execution

---

## Earlier Internal Iterations

LedgerMind was developed through multiple internal phases before public documentation. Key foundational work included:

### Core Infrastructure
- **Docker Compose setup:** Dev and prod stacks with PostgreSQL, Redis, Ollama, nginx
- **Cloudflare Tunnel integration:** Zero-port hosting with global edge CDN
- **OAuth authentication:** Google OAuth 2.0 with refresh tokens

### Frontend
- **React + Vite + TypeScript:** Modern SPA with hot reload
- **Zustand state management:** Chat history, model health, user session
- **TanStack Query:** Server state caching with optimistic updates
- **ChatDock v2:** Floating glassmorphic chat assistant with portal rendering

### Backend
- **FastAPI + SQLAlchemy:** RESTful API with ORM
- **Alembic migrations:** Schema versioning with safe rollback
- **pgvector integration:** RAG for transaction explanations
- **Multi-tenancy:** User-isolated queries and data

### ML/AI
- **LLM integration:** Ollama local runtime + OpenAI fallback
- **RAG pipeline:** Transaction context enrichment for explanations
- **Categorization rules:** Heuristic + ML-based suggestions
- **Streaming chat:** Server-sent events for real-time responses

### Testing
- **Hermetic backend tests:** Stubbed external dependencies, deterministic
- **Playwright E2E:** Full user flows with authentication
- **Vitest frontend tests:** Component unit tests
- **Smoke tests:** Production readiness validation

---

## Versioning Notes

LedgerMind currently uses **git SHA-based versioning** (e.g., `main-065b709a`) instead of semantic versioning. This approach:
- Provides precise traceability to source code
- Works well with single-host Docker deployments
- Eliminates version bump ceremony during rapid iteration

**Future consideration:** Migrate to semantic versioning (e.g., `v1.0.0`) once the platform stabilizes for multi-tenant production use.

---

**See Also:**
- [Architecture & System Design](OVERVIEW.md)
- [Infrastructure & Deployment](INFRASTRUCTURE.md)
- [Debugging & Troubleshooting](DEBUGGING_GUIDE.md)
- [Full Changelog](../CHANGELOG.md) (archived)
