# Changelog
All notable changes to this project will be documented in this file.

The format loosely follows Keep a Changelog; versions may be git-sha based until semantic versioning is adopted.

## [Unreleased]
### Added
- Architecture / operational documentation expansion (Architecture, Testing, Security, Operations, Contributing planned).
- Deploy checklist for structured pre/post release validation.

### Changed
- README enriched with Quick Start, environment table, service diagram, and cross-links.

### Deprecated
- `/llm/models` endpoint (shim still present; scheduled removal – see LLM_SETUP.md).

---
## [2025-11-05] ML Pipeline Phase 2.1 (Integration Complete)
### Added
- **Schema-agnostic merchant-majority labeler** (support≥3, p≥0.70)
- **Confidence gate** → "Ask the agent" path (`BEST_MIN=0.50` threshold)
- **Durable logging**: `suggestions.reason_json`, `source`, `model_version` persisted for explainability
- **Suggestion tables**: `suggestions` + `suggestion_events` (SQLite-compatible)
- **Reconciliation migration**: `20251105_reconcile_ml_schema` (safe adds only, no destructive ops)
- **CI drift guard**: `.github/workflows/db-drift.yml` blocks PRs with schema drift
- **Make targets**: `ml-smoke-test`, `ml-drift-check`, `ml-verify-logs`, `ml-merchant-labels`
- **Golden set**: 20 transactions across 4 merchants (Amazon, Starbucks, Target, Whole Foods)
- **API enhancements**: `SuggestionCandidate` now includes structured reasons (List[Union[str, dict]]), source, model_version
- **UI Accept flow added**: `POST /ml/suggestions/{id}/accept` endpoint with idempotent metric tracking
- **SuggestionCard component**: Accept button, mode chips (rule/model/ask), collapsible reasoning viewer
- **Prometheus metric**: `lm_ml_suggestion_accepts_total{model_version, source, label}` (idempotent - only increments on first accept)
- **ML Status endpoint**: `GET /ml/status` for operational visibility (shadow/canary/calibration config)
- **Canary controls**: Makefile targets (`canary-0/10/50/100/status`) for gradual rollout
- **Backfill script**: `scripts/backfill_merchant_labels.sql` for top 50 merchants
- **E2E smoke scripts**: Bash + PowerShell versions for accept flow validation
- **Playwright tests**: UI acceptance spec for suggestion card interactions

### Changed
- Merchant labeler: Schema-agnostic (auto-detects `user_labels` vs `transaction_labels`)
- serve.py: Unified candidate pool architecture (merchant majority → heuristic rules → ML model)
- SuggestionCard: Enhanced with color-coded mode chips and max-height reasoning viewer

### Fixed
- Database schema drift: Added missing `suggestion_events` table
- ORM relationship errors: Commented broken `back_populates` in `TransactionLabel`/`MLFeature` models
- Merchant labeler: Now handles both dict and ORM transaction objects
- Accept endpoint: Idempotent guard ensures metric only increments when flipping `accepted` from false → true

### Documentation
- [`apps/backend/ML_DEPLOYMENT_COMPLETE.md`](apps/backend/ML_DEPLOYMENT_COMPLETE.md) - Full integration summary
- [`apps/backend/ML_PIPELINE_SMOKE_TEST.md`](apps/backend/ML_PIPELINE_SMOKE_TEST.md) - Comprehensive test checklist
- [`docs/GRAFANA_ML_PANELS.md`](docs/GRAFANA_ML_PANELS.md) - 4 paste-ready Prometheus queries (Accept Rate, Top Accepts, Ask-Agent Rate, Canary Coverage)
- [`docs/ML_CANARY_RAMP_PLAYBOOK.md`](docs/ML_CANARY_RAMP_PLAYBOOK.md) - Full rollout strategy (0% → 100%)
- [`docs/CANARY_RAMP_QUICKOPS.md`](docs/CANARY_RAMP_QUICKOPS.md) - Daily ops checklist for canary ramp
- [`docs/ML_E2E_SMOKE_TEST.md`](docs/ML_E2E_SMOKE_TEST.md) - E2E validation guide
- [`docs/GITHUB_BRANCH_PROTECTION.md`](docs/GITHUB_BRANCH_PROTECTION.md) - CI/CD required checks setup

### Testing
- ✅ All 4 merchants return perfect p=1.00 labels
- ✅ suggest_auto() working end-to-end
- ✅ API endpoint tested with full request/response cycle
- ✅ Database logging verified (suggestions + suggestion_events)
- ✅ Accept endpoint idempotency validated (standalone test script)
- ✅ Schema drift check passes (0 missing columns)
- ✅ Playwright UI tests for suggestion card acceptance

---
## [2025-09-27] Initial Public Documentation Consolidation
### Added
- `CRYPTO_SETUP.md` detailing GCP KMS envelope encryption enablement & troubleshooting.
- `TROUBLESHOOTING_CLOUDFLARE_TUNNEL.md` capturing origin mismatch (HTTPS→HTTP) and QUIC fallback guidance.
- `LLM_SETUP.md` describing primary (Ollama) vs fallback (OpenAI) and model availability derivation via `llmStore`.
- `SMOKE_TESTS.md` plus cross-platform smoke scripts for readiness gating.
- `VERIFY_PROD.md` and `DEPLOY_CHECKLIST.md` for systematic verification.

### Changed
- Cloudflare tunnel origin normalized from `https://nginx:443` to `http://nginx:80` eliminating external 502 during health probes.
- Introduced frontend `llmStore` consolidating model health and gating Explain/Rephrase features.

### Security
- KMS encryption activated (`mode: kms`) with documented env + SA role requirement.

### Tooling / Testing
- Hermetic test runner adjustments ensuring isolated pytest execution.

### Notes
This date-stamped section serves as a baseline; earlier internal iterations were not versioned publicly.
