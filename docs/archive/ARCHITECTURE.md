# ARCHITECTURE

High-level view of the LedgerMind (AI Finance Agent) stack and major flows.

## 1. Component Diagram
```
Browser (React/Vite, Zustand stores)
   │
   ▼
Cloudflare Edge (TLS termination, global POP)
   │ (QUIC / HTTP2)
   ▼
cloudflared (tunnel client) ── health probes, originRequest tuning
   │ (HTTP)
   ▼
nginx (reverse proxy + static assets + caching headers)
   │
   ├── /assets/*  (immutable hashed JS/CSS)
   │
   └── / (API pass-through)
         │
         ▼
FastAPI Backend (app.main)
   ├── Routers: /agent/* /api/* /admin/* /llm/* (shim) /ingest /config
   ├── Crypto Layer (envelope encryption, KMS DEK unwrap at startup)
   ├── LLM Adapter (primary local Ollama + fallback OpenAI-compatible)
   ├── Business Logic (categorization rules, explain traces, budgeting)
   ├── Persistence (SQLAlchemy + Postgres)
   └── Test Utilities (hermetic fixtures, deterministic stubs)

Ollama (LLM runtime)  ← local network →  Backend
Postgres (data)       ← SQLAlchemy ORM → Backend
```

## 2. Request Flow (Illustrative: Explain Transaction)
1. User clicks "Explain" in UI → `/agent/chat` POST with intent `explain_txn`.
2. Backend builds context (transactions, rules, merchants, insights) with trimming.
3. LLM Adapter selects model (local primary unless disabled, else fallback).
4. Model response enriched with citations & rationale.
5. Response returned; UI merges into unified chat stream via `llmStore` gating.

## 3. Model Availability & Health
```
/agent/models  ---> Aggregates providers
   |            (local primary Ollama + fallbacks)
   └─> Frontend llmStore polls / uses on-demand fetch
           │
           └─> derives modelsOk (>=1 healthy model)
                        │
                        ├─> Enables Explain/Rephrase actions
                        └─> Disables with graceful UI if false
```
Legacy `/llm/models` preserved temporarily as shim (see LLM_SETUP.md). `/llm/health` provides lower-level runtime ping.

## 4. Encryption (KMS-Backed Envelope)
```
Startup:
 1. Read env: ENCRYPTION_ENABLED=1, GCP_KMS_KEY, GOOGLE_APPLICATION_CREDENTIALS
 2. Fetch wrapped DEK (or generate + wrap if initializing)
 3. Call GCP KMS: decrypt (unwrap) -> memory-only DEK
 4. Provide encrypt/decrypt helpers to domain services (PII fields)
Runtime:
  - Each encrypt -> symmetric AEAD (AAD=GCP_KMS_AAD)
  - Rotation: new KEK version unwrap + rewrap/batch optional
```
Status endpoint `/api/crypto-status` returns `{"mode":"kms"|"disabled","label":...,"wlen":...}`.

## 5. Testing Layers
| Layer | Scope | Traits | Entry |
|-------|-------|--------|-------|
| Hermetic | Core logic, routers (stubbed external) | Fast (< seconds), deterministic | `apps/backend/scripts/test.ps1 -Hermetic` |
| Full Pytest | Broader integration (optional) | May hit local services | `pytest` (root/backend) |
| Smoke | External HTTP surface | Minimal, non-destructive | `scripts/smoke.(sh|ps1)` |
| Manual Verify | Human checklist | Deep / observational | `docs/VERIFY_PROD.md` |

## 6. State Management (Frontend)
- Zustand stores hold chat history, model health, tool availability.
- Persistent chat stored in `localStorage` with BroadcastChannel sync.
- Model selection per tab stored in `sessionStorage` for isolation.

## 7. Performance Considerations
| Aspect | Optimization |
|--------|-------------|
| Context Trimming | Intent-specific pruning reduces tokens. |
| HTTP Reuse | Shared clients keep-alive to LLM + KMS endpoints. |
| Caching | Help/describe cache with hit/miss metrics. |
| DB Access | Batching of related transaction lookups. |

## 8. Observability
| Surface | Mechanism |
|---------|----------|
| Health | `/ready`, `/api/healthz`, `/llm/health` |
| Crypto | `/api/crypto-status` |
| Models | `/agent/models` |
| Metrics (future) | Prometheus integration potential |

## 9. Future Enhancements
- Remove `/llm/models` shim after deprecation window.
- Structured logs on model health transitions.
- Prometheus gauges for model count + encryption mode.
- Policy-driven key rotation automation.

Cross-refs: [LLM_SETUP](LLM_SETUP.md) · [CRYPTO_SETUP](CRYPTO_SETUP.md) · [SMOKE_TESTS](SMOKE_TESTS.md) · [TESTING](TESTING.md) (to be added) · [SECURITY](SECURITY.md)
