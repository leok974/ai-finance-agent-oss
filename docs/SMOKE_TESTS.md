# Smoke Tests & Readiness Validation

> Fast, automated checks to confirm a deployment is basically healthy before deeper testing.

Scripts provided (cross‑platform):
- `scripts/smoke.sh`
- `scripts/smoke.ps1`
- `scripts/edge-asset-smoke.ps1` (PowerShell; verifies edge asset MIME and index cache headers)

These scripts are intentionally minimal and non-destructive. They verify core surfaces: liveness/readiness, static asset serving (via web), model availability, and crypto/KMS mode.

## What They Check (Current)
| Category | Endpoint / Check | Expectation (✅) | Failure Meaning (❌) |
|----------|------------------|------------------|----------------------|
| Readiness | `GET /ready` | 200 & JSON contains `"ok":true` | Backend not booted or dependency (DB) failing. |
| Health | `GET /api/healthz` | 200 | App process reachable; not full dependency audit. |
| LLM Health | `GET /llm/health` | 200 & provider status fields | LLM runtime unreachable (Ollama down / fallback unset). |
| Models | `GET /agent/models` | 200 & ≥1 model when primary/fallback expected | Empty list ⇒ no usable LLM; gated UI. |
| Crypto | `GET /api/crypto-status` | 200 & `mode":"kms"` (prod) or `disabled` (dev) | KMS misconfig (missing SA / key / env). |
| Legacy Shim (temp) | `GET /llm/models` | 200 (until removed) | 404 indicates shim retired; update clients. |
| Static Asset (optional) | Frontend root (`/`) | 200 HTML with bundle refs | Frontend build missing or nginx route issue. |

## Exit Semantics
Current scripts exit non-zero if any mandatory checks fail:
- Mandatory: `/ready`, `/api/healthz`, `/api/crypto-status` (must respond 200), and crypto mode must not regress if encryption expected.
- Optional: `/llm/models` tolerated to 404 after deprecation (can be toggled in future via a flag if desired).

## Usage
### Bash
```
./scripts/smoke.sh
```
### PowerShell
```
./scripts/smoke.ps1
```
Both assume localhost access (e.g., port-forward, direct, or tunnel exposed). To target a remote base URL:
```
BASE_URL="https://your-host.example" ./scripts/smoke.sh
```
Or in PowerShell:
```
$env:BASE_URL = "https://your-host.example"; ./scripts/smoke.ps1
```

## Interpreting Results
| Output Snippet / Line | ✅ Meaning | ❌ Investigate |
|-----------------------|-----------|--------------|
| `READY ✅` | `/ready` succeeded | Service down / dependency failure |
| `HEALTHZ ✅` | `/api/healthz` OK | Internal error / crash loop |
| `LLM HEALTH ✅` | `/llm/health` reachable | LLM runtime not started |
| `MODE kms ✅` | Encryption active | Wrong key / missing SA role |
| `MODE disabled ✅` | Expected in local dev without KMS | If prod: misconfiguration |
| `MODELS >=1 ✅` | At least one model available | 0 ⇒ warm Ollama or add fallback |
| `LEGACY /llm/models: 404` | Shim removed (expected post-deprecation) | If expecting shim: out-of-date client |

## Extending the Smoke Suite
Add new assertions when you introduce new critical surfaces. Suggested additions:
| Feature | Endpoint | Condition |
|---------|----------|-----------|
| Chat API | `POST /agent/chat` | 200 & structured body after trivial prompt. |
| Tool Invocation | `POST /agent/tools/list` (example) | Non-empty list. |
| Database Migration Check | `GET /api/db-status` (future) | `schema_ok: true`. |

Keep smoke checks ≤ ~2 seconds runtime to preserve fast feedback in CI/CD.

## Design Principles
- Deterministic: No randomness, no long polling.
- Idempotent: Safe to run repeatedly between deploy steps.
- Fast-Fail: Abort early on foundational failures (e.g., readiness).
- Portable: Minimal external dependencies (curl / PowerShell Invoke-RestMethod).

## Adding a New Check (Example - Chat Echo)
Pseudo-diff concept for `smoke.sh`:
```bash
resp=$(curl -s -X POST "$BASE_URL/agent/chat" -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"ping"}],"max_tokens":16}')
echo "$resp" | grep -qi 'ping' || fail "Chat echo missing"
```

## Relationship to Other Docs
- `VERIFY_PROD.md`: Broader, manual checklist (SSL, tunnel edge behavior, etc.).
- `LLM_SETUP.md`: Deep dive into model provider architecture and health gating.
- `CRYPTO_SETUP.md`: Detailed encryption/KMS activation & troubleshooting.

## Roadmap Ideas
| Idea | Rationale |
|------|-----------|
| JSON summary output (`--json`) | Integrate with CI dashboards. |
| Threshold flags (e.g. `--require-model`) | Pipeline gating when LLM mandatory. |
| Parallelization (bash subshells) | Further reduce runtime as checks grow. |

---
Maintain this document as you add/remove critical health surfaces. Keep the scripts minimal; push complex logic into dedicated test suites instead of smoke scripts.

See also: [DEPLOY_CHECKLIST](DEPLOY_CHECKLIST.md) for structured pre/post deploy flow.
