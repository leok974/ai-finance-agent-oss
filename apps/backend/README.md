# Backend notes: Merchant canonicalization and suggestions

This backend stores a canonical form of `Transaction.merchant` in `transactions.merchant_canonical`.

- Canonicalization function: `app/utils/text.py` → `canonicalize_merchant(s: str) -> str | None`
  - Lowercases, strips diacritics, replaces punctuation with spaces, collapses whitespace.
  - Example: "  Café—Gamma  #12" → "cafe gamma 12"
- Storage and sync:
  - ORM sets `merchant_canonical` via a validator when `merchant` is written.
  - A migration added the column and backfilled existing rows, and created a non‑unique index.
- Service behavior:
  - Rule suggestions prefer SQL-side filtering on `transactions.merchant_canonical` when present.
  - Fallback to Python canonicalization if the column is missing (e.g., in older DBs).
- Recompute tool:
  - If you change the algorithm or bulk-load new data, recompute canonicals:
    - Script: `app/scripts/recanonicalize_merchants.py`
    - Options: `--batch <N>`, `--dry-run`, `--only-missing`
    - Quick command:
      - `python -m app.scripts.recanonicalize_merchants --only-missing`

Suggestions & preview
- When present, services prefer SQL-side filtering on `transactions.merchant_canonical` (faster and consistent).
- Preview/backfill share the same windowing and uncategorized filters; keep `window_days` consistent between calls.

Preview/Backfill windowing
- The `/rules/preview` and `/rules/{id}/backfill` endpoints use identical base/window/when filters.
- To keep counts consistent, the UI must pass the same `window_days` to both calls.
- Windowing is inclusive-by-day (>= cutoff.date()); uncategorized means NULL, empty, or "Unknown".

Migrations hardening
- `feedback.created_at` is NOT NULL with a DB default (now/CURRENT_TIMESTAMP). Indexes are guarded.
- The `merchant_canonical` migration includes a note: if the util changes later, rerun the recanonicalize script or add a follow-up migration.

### Environment flags

The backend uses `APP_ENV` (preferred) or `ENV` to decide behavior:

- `APP_ENV=prod` (default if unset) → production-safe (hides dev-only fields)
- `APP_ENV=dev` → enables extra debug fields (e.g. `merchant_canonical` in `/txns/recent`)
- `APP_ENV=test` → used in pytest runs

Never run prod deployments with `APP_ENV=dev`.

---

## Auth & CSRF (Sep 2025)

Cookie-based auth
- Backend issues HttpOnly `access_token` and `refresh_token` cookies on login/register/refresh and OAuth finalize.
- Clients should send requests with `credentials: include`; no token storage in local/session storage.

CSRF protection (double-submit cookie)
- Backend sets a non-HttpOnly `csrf_token` cookie alongside auth cookies.
- Mutating endpoints (POST/PUT/PATCH/DELETE) require header `X-CSRF-Token` that must match the `csrf_token` cookie.
- GET endpoints are CSRF-free by design.

Endpoints protected
- Auth: `POST /auth/refresh`, `POST /auth/logout`.
- Rules: Admin preview/backfill, suggestions apply/ignore, ignores add/remove, persisted refresh, and DELETE endpoints.
- Transactions: categorize (both forms), transfer link/unlink, splits create/delete, recurring scan, reclassify.
- ML: train, selftest, feedback.
- Budgets: apply, set, delete.

CORS and headers
- CORS allows dev origins `http://127.0.0.1:5173` and `http://localhost:5173`, `allow_credentials=True`.
- `allow_headers` include `Authorization`, `Content-Type`, `X-CSRF-Token`. `Content-Disposition` is exposed for downloads.

Prod env switches
- `COOKIE_SECURE=1`
- `COOKIE_SAMESITE=lax` (or `none` for HTTPS cross-site)
- `COOKIE_DOMAIN=your.app.domain`
- `OAUTH_POST_LOGIN_REDIRECT=https://your.app.domain/app`

Cookie flags
- Dev: `COOKIE_SAMESITE=lax`, `COOKIE_SECURE=0`.
- Prod: `COOKIE_SECURE=1`, `COOKIE_SAMESITE=lax` (or `strict` if flows allow), consider `__Host-` prefix for cookies (requires Secure, path=/, no Domain) for strongest isolation.

CORS allowlist
- Use `CORS_ALLOW_ORIGINS` (comma-separated) in prod to explicitly set allowed origins; `allow_credentials=True` ensures `Access-Control-Allow-Credentials: true` on responses.

---

## LLM configuration (OpenAI-compatible)

The backend talks to any OpenAI-compatible server. Defaults target a local Ollama:

- `OPENAI_BASE_URL` — default `http://localhost:11434/v1` (Ollama shim path)
- `OPENAI_API_KEY` — default `ollama` (dummy for Ollama; real key for OpenAI/vLLM with auth)
- `MODEL` — default `gpt-oss:20b` (Ollama tag or OpenAI model id)
- `DEFAULT_LLM_PROVIDER` — `ollama` or `openai` (mostly informational; discovery uses it)

Examples
- Ollama: `OPENAI_BASE_URL=http://localhost:11434/v1`, `OPENAI_API_KEY=ollama`, `MODEL=gpt-oss:20b`
- OpenAI: `OPENAI_BASE_URL=https://api.openai.com/v1`, `OPENAI_API_KEY=sk-...`, `MODEL=gpt-4o-mini`
- vLLM: `OPENAI_BASE_URL=http://127.0.0.1:8001/v1`, `OPENAI_API_KEY=anything`, `MODEL=<your-model>`

Notes
- Chat calls route through `app/utils/llm.py` or `app/services/llm.py` and honor these envs.
- Model listing uses provider-aware endpoints (Ollama `/api/tags`, OpenAI `/models`).

---

## Test/dev bypass flags

Only for local/dev and hermetic tests; never enable in prod:

- `DEV_ALLOW_NO_AUTH=1` — bypasses auth guards in tests/dev utilities
- `DEV_ALLOW_NO_CSRF=1` — disables CSRF checks (unsafe methods) for hermetic tests
- `DEV_ALLOW_NO_LLM=1` — forces deterministic stub replies from the LLM client

These are read by `app/utils/csrf.py`, `app/services/llm.py`, and some test helpers.

---

## Explain endpoint (Sep 2025)

Deterministic, DB-backed transaction explanations with optional LLM polish.

- Route: `GET /txns/{txn_id}/explain`
  - Query: `use_llm=1` to request a short LLM rephrase (optional; see below).
- Response shape:
  - `txn`: `{ id, date, merchant, description, amount, category, month }`
  - `evidence`:
    - `merchant_norm`: canonical merchant (see canonicalization section)
    - `rule_match`: `{ id, pattern, target, category } | null`
    - `similar`: `{ total, by_category: [{ category, count, share }], recent_samples: [{ id, date, merchant, amount, category }] }`
    - `feedback`: `{ txn_feedback: [{ label, source, created_at }], merchant_feedback: { total, by_label: [{ label, count, share }] } }`
  - `candidates`: `[ { label, confidence, source } ]` (rule and history-based; never `Unknown`)
  - `rationale`: deterministic one-liner including `merchant_norm` and top historical category
  - `llm_rationale`: optional, non-empty only when LLM rephrase succeeds
  - `mode`: `"deterministic" | "llm"` (set based on `llm_rationale`)
  - `actions`: short actionable suggestions (e.g., accept category, apply rule)

Evidence sources
- Rules: first matching active rule (pattern/target/merchant/description) mirrors rule application logic.
- Similar history: last 365 days by canonical merchant; includes base-token prefix grouping (e.g., `target store` groups with `target ...`).
- Feedback: latest labels both for this txn and aggregated for the merchant group.

Caching (nice to have)
- Short-lived in-memory cache keyed by `(txn_id, sources_signature, use_llm, model)`.
- Sources signature includes the latest `updated_at/created_at` across: the txn, any rule, any feedback for the merchant group, and similar transactions in the last year.
- Default TTL: 10 minutes; configure via `EXPLAIN_CACHE_TTL` (seconds). Minimum enforced: 60s.

Rate limiting (LLM)
- Token bucket for LLM rephrases, default ~30 calls/minute across the app.
- Configure capacity via `LLM_BUCKET_CAPACITY`. Refill rate derived as `capacity/60` per second.
- If tokens are not available, the service falls back to deterministic mode.

DEV/test behavior
- `DEV_ALLOW_NO_LLM=1` forces deterministic mode even when `use_llm=1`.
- Tests cover: 200/404, evidence correctness (top category), deterministic rationale content, DEV no-LLM handling, and mocked LLM path.

Client notes
- GET endpoint is CSRF-free. The frontend can show `rationale` immediately; when `mode=llm`, prefer `llm_rationale` if present.
