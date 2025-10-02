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

### Fixed
- Restored `/llm/models` legacy shim by adapting to `app.routers.agent.list_models()` instead of removed `app.routes.agent`. Prevents `ModuleNotFoundError` on backend startup.

### Security
- Clarified secrets policy (service account JSON under `secrets/` ignored by git).

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

