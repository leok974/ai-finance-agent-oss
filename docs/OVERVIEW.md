# LedgerMind – Architecture & System Design

Complete technical overview of the LedgerMind AI Finance Agent platform.

---

## System Architecture

LedgerMind is a full-stack personal finance platform with ML-powered categorization, LLM-based chat assistance, and automated insights.

### Component Diagram

```
Browser (React/TypeScript + Vite + Zustand)
   │
   ▼
Cloudflare Edge (TLS termination, global CDN)
   │ (QUIC / HTTP/2)
   ▼
cloudflared (tunnel client)
   │ (HTTP)
   ▼
nginx (reverse proxy + static assets)
   │
   ├── /assets/*  → immutable hashed JS/CSS
   └── /         → API pass-through
       │
       ▼
FastAPI Backend (Python)
   ├── Routers: /auth, /api, /agent, /ml, /ingest
   ├── Crypto: KMS envelope encryption (GCP)
   ├── LLM Adapter: Ollama (primary) + OpenAI fallback
   ├── ML Engine: Transaction categorization with RAG
   └── Database: PostgreSQL + pgvector

Services:
  Ollama (local LLM runtime)
  PostgreSQL (data + vector embeddings)
  Redis (optional caching)
```

### Request Flow (Chat Explain Transaction)

1. User clicks "Explain" → `/agent/chat` POST with `intent: explain_txn`
2. Backend builds context (transactions, rules, merchants, insights)
3. LLM Adapter selects model (Ollama primary, OpenAI fallback)
4. Model response enriched with citations & rationale
5. Response streamed to UI via `llmStore`

---

## Frontend Architecture

### Technology Stack

- **React 18** with TypeScript
- **Vite** for build/dev server
- **Zustand** for state management
- **TanStack Query** for server state
- **Tailwind CSS** + shadcn/ui components

### State Management

| Store | Responsibility | Persistence |
|-------|----------------|-------------|
| `useChatSession` | Chat history, LLM interactions | localStorage + BroadcastChannel |
| `llmStore` | Model health, availability gates | sessionStorage (per-tab) |
| `useAuth` | User session, OAuth flow | httpOnly cookies |
| `useDashboard` | Charts, budgets, insights | TanStack Query cache |

### ChatDock v2 Architecture

The finance assistant renders as a **floating card** at bottom-center with fixed launcher bubble in bottom-right.

**Key Features:**
- **Portal rendering**: Uses `createPortal()` to mount to `document.body`
- **Glassmorphic overlay**: Page remains scrollable, overlay uses `pointer-events: none` except on shell
- **Dual CSS imports**:
  - `index.css` imports `chat/index.css` (prevents orphaned chunks)
  - `ChatDock.tsx` imports `../chat/index.css` (component-level)
- **Keyboard UX**: ESC to close, Ctrl+Enter to send

**Component Tree:**
```
ChatDock.tsx
├── Launcher (bottom-right, draggable)
└── Portal → document.body
    └── Overlay (fullscreen, pointer-events: none)
        └── Shell (480px max, pointer-events: auto)
            ├── Backdrop (radial gradient + blur)
            └── Panel
                ├── Header (title, status badge, export)
                ├── ScrollContainer (messages, chips)
                └── Composer (textarea, QuickChips)
```

**CSS Verification:** After modifying chat CSS, run `pnpm build && pnpm verify:chat-css` to ensure styles are bundled correctly.

---

## Backend Architecture

### Technology Stack

- **FastAPI** (Python 3.12+)
- **SQLAlchemy** ORM + Alembic migrations
- **PostgreSQL** with pgvector extension
- **Pydantic v2** for validation
- **httpx** for async HTTP clients

### ML Pipeline (Phase 2.1)

**Categorization Flow:**
1. **Merchant-majority labeler**: Support ≥3 txns, confidence ≥0.70
2. **Heuristic rules**: Pattern-based (e.g., "PAYPAL *NETFLIX" → streaming)
3. **ML model**: scikit-learn RandomForest with feature engineering
4. **Confidence gate**: Below 0.50 → "Ask the agent" path

**Data Model:**
- `suggestions` table: candidate categories with structured reasoning
- `suggestion_events` table: accept/reject tracking
- `transaction_labels` table: merchant-level ground truth
- `ml_features` table: pre-computed features for model training

**Rollout Controls:**
- Canary flag: 0% → 10% → 50% → 100% gradual ramp
- Shadow mode: ML predictions logged but not shown
- Metrics: Prometheus `lm_ml_suggestion_accepts_total{model_version, source}`

### Encryption (KMS Envelope)

```
Startup:
  1. Read env: ENCRYPTION_ENABLED=1, GCP_KMS_KEY, GOOGLE_APPLICATION_CREDENTIALS
  2. Fetch wrapped DEK (or generate + wrap if initializing)
  3. Call GCP KMS: decrypt (unwrap) → memory-only DEK
  4. Provide encrypt/decrypt helpers for PII fields

Runtime:
  - Each encrypt → symmetric AEAD (AAD=GCP_KMS_AAD)
  - Rotation: new KEK version unwrap + rewrap (batch optional)
```

**Status endpoint:** `/api/crypto-status` returns `{"mode": "kms"|"disabled", "label": "...", "wlen": ...}`

### LLM Integration

**Model Availability:**
- **Primary:** Ollama (local, privacy-first)
- **Fallback:** OpenAI-compatible endpoint
- **Health checks:** `/agent/models` aggregates providers
- **Frontend gating:** `llmStore.modelsOk` enables Explain/Rephrase actions

**Legacy shim:** `/llm/models` preserved temporarily (scheduled removal).

---

## Specialist Agents

LedgerMind uses **domain-focused agents** instead of a single generalist:

| Agent | Scope | Use For |
|-------|-------|---------|
| `api-agent` | Backend API, DB, ML, RAG | Adding endpoints, tuning ML, RAG integration |
| `test-agent` | Vitest, Playwright, Pytest | Writing tests, fixing flakes, E2E scenarios |
| `docs-agent` | Docs, runbooks, architecture | Updating docs, cleaning drift, runbooks |
| `dev-deploy-agent` | Docker, dev stack, smoke tests | Local dev experience, Docker configs |
| `security-agent` | Auth, CSRF, SSRF, secrets, CSP | Security controls, auth flows, policy docs |

**Key Features & Endpoints:**

**Manual Categorization with Undo:**
- `POST /transactions/{txn_id}/categorize/manual` — Bulk categorization with scopes (`just_this`, `same_merchant`, `same_description`)
- `POST /transactions/categorize/manual/undo` — Safe revert (only reverts unchanged txns)
- **UI surfaces:**
  - `ExplainSignalDrawer`: Manual categorization form, saves to localStorage
  - `ManualCategorizeSettingsDrawer`: Shows last change with undo button

**Safety pattern:** Undo only reverts rows where `current_category == new_category_slug` from bulk operation.

---

## Performance & Observability

### Optimizations

| Aspect | Strategy |
|--------|----------|
| Context Trimming | Intent-specific pruning reduces LLM tokens |
| HTTP Reuse | Shared clients keep-alive to LLM + KMS |
| Caching | Help/describe cache with hit/miss metrics |
| DB Batching | Related transaction lookups grouped |

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/ready` | Liveness probe (HTTP 200) |
| `/api/healthz` | Full health check (DB + Redis + models) |
| `/llm/health` | LLM runtime ping |
| `/agent/models` | Model availability aggregation |
| `/api/crypto-status` | Encryption mode status |
| `/ml/status` | ML pipeline config (shadow/canary/calibration) |

### Metrics (Prometheus-compatible)

- `lm_ml_suggestion_accepts_total{model_version, source, label}` — Idempotent accept tracking
- Future: Model health gauges, encryption mode, cache hit rates

---

## Testing Strategy

| Layer | Scope | Traits | Entry |
|-------|-------|--------|-------|
| **Hermetic** | Core logic, routers (stubbed external) | Fast (<5s), deterministic | `apps/backend/scripts/test.ps1 -Hermetic` |
| **Full Pytest** | Integration (local services) | Slower, optional | `pytest` (backend root) |
| **Vitest** | Frontend unit tests | Fast, isolated | `pnpm -C apps/web vitest run` |
| **Playwright** | E2E (UI + API) | Full browser, slow | `pnpm -C apps/web exec playwright test` |
| **Smoke** | External HTTP surface | Minimal, non-destructive | `scripts/smoke.ps1` |
| **Manual** | Human checklist | Deep observational | See DEBUGGING_GUIDE.md |

---

## Multi-Tenancy & Security

### User Isolation

- All queries scoped by `user_id` (SQLAlchemy filters)
- Transactions, rules, budgets, chat history user-isolated
- OAuth callback validates `state` parameter (CSRF protection)

### CSP & CORS

- **CSP:** Enforced via server headers (no inline scripts)
- **CORS:** Whitelist only `app.ledger-mind.org`
- **CSRF:** Token validation on state-changing endpoints

### SSRF Protections

- No user-supplied URLs allowed for external fetches
- Allowlist for known safe domains (e.g., LLM providers)

---

## Future Enhancements

- Remove `/llm/models` shim after deprecation window
- Structured logs for model health transitions
- Prometheus integration for real-time metrics
- Policy-driven KMS key rotation automation
- Multi-region deployment (Cloudflare global edge)

---

**See Also:**
- [Infrastructure & Deployment](INFRASTRUCTURE.md)
- [Debugging & Troubleshooting](DEBUGGING_GUIDE.md)
- [Release Notes](RELEASE_NOTES.md)
- [Agent System](../AGENTS.md)
