# Backend notes: Merchant canonicalization and suggestions

## Recent Additions (Agent Enhancements)

### RAG System with NVIDIA NIM Embeddings (Production - Nov 2025)

LedgerMind now includes a production-ready Retrieval-Augmented Generation (RAG) system using **NVIDIA NIM Hosted embeddings** for semantic search over financial documents.

**Key Architecture:**

- **Embedding Model**: `nvidia/nv-embedqa-e5-v5` (1024-dimensional, asymmetric)
- **Vector Store**: SQLite with binary-packed float32 embeddings + Python cosine similarity fallback
- **LLM**: `meta/llama-3.1-8b-instruct` via NVIDIA Hosted NIM
- **Persistent Storage**: Kubernetes PVC (`lm-sqlite-pvc`) mounted at `/data`

**Critical: Asymmetric Embeddings**

The `nv-embedqa-e5-v5` model requires different `input_type` parameters for queries vs documents:

```python
# When ingesting documents (passages)
embeddings = await embed_texts(chunks, input_type="passage")

# When performing semantic search (queries)
query_embedding = await embed_texts([user_query], input_type="query")
```

This is because asymmetric models project queries and documents into different embedding spaces optimized for retrieval. Using the wrong `input_type` will result in poor search quality (low cosine similarity scores <0.2).

**Endpoints:**

- `POST /agent/rag/ingest` - Ingest document from URL with chunking & embedding
- `POST /agent/rag/query` - Semantic search with k-nearest neighbors
- `GET /healthz` - Includes `embeddings_count` in `checks` object

**Production Features:**

- ✅ Persistent storage survives pod restarts
- ✅ Feature flags for RAG store type (`RAG_STORE=sqlite`)
- ✅ Rate limiting with exponential backoff (429 retries)
- ✅ Resilience: cosine clamping, empty vector guards, timeout handling
- ✅ Structured logging with timing metrics (ingest/query latency)
- ✅ Health checks with embeddings count

**Running Smoke Test:**

```powershell
# One-command test of health + semantic search
.\smoke-test.ps1
```

**Post-Hackathon Upgrade Path:**
For production scale (>10K documents), migrate to pgvector:

1. Set `RAG_STORE=pgvector` in config
2. Run Alembic migration to add `vector(1024)` column
3. Use native pgvector ANN index (`CREATE INDEX ... USING ivfflat`)
4. Update `semantic_search()` to use `<=>` operator instead of Python fallback

---

### Merchant Parsing Heuristics

Natural language merchant extraction now ignores leading verbs (give, show, list, summarize, tell, display, provide, get) and filters very short tokens (<3 chars) unless whitelisted (UPS, IBM, H&M, UBS). This prevents prompts like "Give me Starbucks spend" from misclassifying "Give" as a merchant. Quoted multi‑word merchants continue to be supported.

### Agent Month Summary Endpoint

New lightweight deterministic endpoint:

`GET /agent/summary/month?month=YYYY-MM`

Response shape:

```jsonc
{
  "month": "2025-09",
  "start": "2025-09-01",
  "end": "2025-09-30",
  "income": 3200.0, // sum of positive amounts for month
  "expenses": 124.9, // sum of absolute value of negative amounts
  "net": 3075.1, // income - expenses
  "top_merchant": {
    // highest expense merchant by absolute spend
    "name": "WholeFoods",
    "spend": 120.4
  }
}
```

If `month` omitted, it resolves the latest month present in transactions.

### Bulk Synthetic Data Seeding

`python -m app.cli txn-demo-bulk --month 2025-09`

Inserts a deterministic mini dataset (paycheck, MacBook purchase, multiple Starbucks coffees, grocery trip, transfer pair) useful for demos and consistent test baselines. Existing rows are left intact (duplicates possible on repeated runs).

---

## Encryption (overview Sep 2025)

The backend uses an envelope model: a Data Encryption Key (DEK) encrypts sensitive free‑text columns; that DEK is itself wrapped by either an env KEK (AES‑GCM) or Google Cloud KMS.

Quick start (env KEK)

```bash
export ENCRYPTION_ENABLED=1
export ENCRYPTION_MASTER_KEY_BASE64=$(openssl rand -base64 32)
alembic upgrade head
python -m app.cli crypto-init
```

KMS mode

```bash
export GCP_KMS_KEY="projects/<proj>/locations/<loc>/keyRings/<ring>/cryptoKeys/<key>"
python -m app.cli crypto-init
```

Status / demo

```bash
python -m app.cli crypto-status
python -m app.cli txn-demo --desc "Latte" --raw "Blue Bottle #42"
python -m app.cli txn-show-latest
```

Backfill legacy plaintext

```bash
python -m app.scripts.encrypt_txn_backfill_splitcols
```

Rotation

```bash
python -m app.cli dek-rotate-begin
python -m app.cli dek-rotate-run --new-label rotating::20250920T120501
python -m app.cli dek-rotate-finalize --new-label rotating::20250920T120501
```

KEK → KMS rewrap (no data rewrite)

```bash
python -m app.cli kek-rewrap-gcp
```

Active KEK rewrap (env only)

```bash
NEW=$(openssl rand -base64 32)
python -m app.cli kek-rewrap --new-kek-b64 $NEW
```

Force new active DEK (only if no encrypted rows yet)

```bash
python -m app.cli force-new-active-dek
```

Write label management

```bash
python -m app.cli write-label-get
python -m app.cli write-label-set --label rotating::20250920T120501
```

Tests (selected)

- `tests/test_cli_kms_rewrap.py`
- Rotation status & backfill covered in integration tests.

Operational notes

- Backup `encryption_keys` before rotation/finalize.
- If `crypto-status` shows `mode=kms` ensure service account has decrypt permission before scaling out.
- Use `dek-rotate-status` between runs to monitor progress.

Failure recovery (env mode)

- Wrong KEK causes unwrap failure: if zero encrypted rows you can `force-new-active-dek`; otherwise restore correct KEK.
- Lost KEK with encrypted data is unrecoverable without backups.

Future

- Add metrics on rotation progress / decrypt failures.
- Optional replication of wrapped DEKs to cold storage.

Deep dive: see `../../docs/encryption.md` for diagrams, metrics, backup checklist, and recovery scenarios.

### Health & Liveness

Endpoints:

| Path | Purpose | Notes |

### Probe wiring (Compose / Nginx)

|------|---------|-------|
| `/live` | Pure liveness | Always `{ "ok": true }`, no DB/crypto access. Use for container liveness probes. |
| `/ready` | Readiness (crypto) | 503 if crypto required & not ready (unless disabled). |
test: ["CMD", "python", "-c", "import urllib.request,sys;hdr={'Host':'backend'};\nfor u in ('http://127.0.0.1:8000/live','http://127.0.0.1:8000/healthz'):\n try:\n req=urllib.request.Request(u,headers=hdr);\n with urllib.request.urlopen(req,timeout=2) as r:\n if r.getcode()==200: sys.exit(0)\n except Exception: pass\nsys.exit(1)"]

`/healthz` response (fields):

- `ok` / `status`: overall health (crypto disabled alone keeps `ok=true`).
- `reasons`: warning reasons (informational reasons removed unless `CRYPTO_STRICT_STARTUP` enabled).
- `info_reasons` / `warn_reasons`: classification arrays (e.g. `crypto_disabled` is informational).
- `migration_diverged`: boolean flag if multiple Alembic heads detected at startup.
- `alembic`: `{ db_revision, code_head, in_sync }`.
- `crypto_mode`: `disabled | env | kms`.
- `version`: `{ branch, commit }` (populated at build via `GIT_BRANCH`, `GIT_COMMIT`).
  - `version.build_time`: ISO or raw build timestamp if supplied via `BUILD_TIME`.

Reasons taxonomy:

| Reason                   | Severity | Description                                                           |
| ------------------------ | -------- | --------------------------------------------------------------------- |
| `db_unreachable`         | warn     | DB cannot be pinged.                                                  |
| `models_unreadable`      | warn     | ORM metadata query failed.                                            |
| `alembic_out_of_sync`    | warn     | DB revision != code head.                                             |
| `multiple_alembic_heads` | warn     | Divergent migration heads on disk.                                    |
| `crypto_not_ready`       | warn     | Crypto enabled but DEK not loaded.                                    |
| `crypto_disabled`        | info     | Encryption disabled by env (suppressed from `reasons` unless strict). |

Prometheus metrics (selected):

- `alembic_multiple_heads` (gauge) — 1 if multiple heads present at startup.
- `health_reason{reason,severity}` (gauge) — 1 if reason currently active else 0.
- `health_overall` (gauge) — 1 when `ok=true`, 0 when degraded.
- `crypto_ready`, `crypto_mode_env`, `crypto_keys_total`, `crypto_active_label_age_seconds` — crypto subsystem metrics.

Build metadata:

Pass at build or compose time:

```bash
docker build --build-arg GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD) \
             --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) ...
```

Compose variables:

```bash
export GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
export GIT_COMMIT=$(git rev-parse --short HEAD)
docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d --build backend
```

Strict mode:

`CRYPTO_STRICT_STARTUP=1` elevates `crypto_disabled` to a warning (kept in `reasons`).

Use Cases:

- Platform liveness: `/live` for container restart detection (no DB pressure).
- Readiness with optional crypto: `/ready` (fast) or `/healthz` (full) for load balancer gating.
- Divergence alerting: scrape `alembic_multiple_heads` or `health_reason{reason="multiple_alembic_heads"}`.

### Probe wiring (Compose / Nginx)

Compose healthcheck (backend):

```yaml
healthcheck:
  test:
    [
      "CMD-SHELL",
      "curl -fsS http://127.0.0.1:8000/live || curl -fsS http://127.0.0.1:8000/healthz",
    ]
  interval: 10s
  timeout: 3s
  retries: 10
  start_period: 60s
  Recent hardening changes applied to the backend + edge:
```

Nginx upstream lightweight probe:

```nginx
location = /_up {
  proxy_pass http://backend:8000/live;
  access_log off;
}
```

External uptime monitor: hit `/_up` (maps to `/live`).

### Prometheus alert examples

```yaml
groups:
  - name: ledgermind.health
    rules:
      - alert: LedgerMindDegraded
        expr: max by(instance) (health_reason{severity="warn"}) == 1
        for: 2m
        labels: { severity: page }
        annotations:
          summary: "LedgerMind degraded"
          description: "One or more warn-class reasons present on /healthz."
      - alert: LedgerMindDown
        expr: up{job="ledgermind"} == 0
        for: 1m
        labels: { severity: page }
        annotations:
          summary: "LedgerMind down"
          description: "Instance not scraping (/healthz)."
```

This backend stores a canonical form of `Transaction.merchant` in `transactions.merchant_canonical`.

- Canonicalization function: `app/utils/text.py` → `canonicalize_merchant(s: str) -> str | None`
  - Lowercases, strips diacritics, replaces punctuation with spaces, collapses whitespace.
  - Example: " Café—Gamma #12" → "cafe gamma 12"
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

### Encryption CLI (quick start)

Utilities are available under `python -m app.cli` inside the backend container.

PowerShell helpers (Windows):

```powershell
$BE=(docker ps --format "{{.Names}}" | Select-String -Pattern "backend"  | % { $_.ToString() })
$PG=(docker ps --format "{{.Names}}" | Select-String -Pattern "postgres" | % { $_.ToString() })

# Init + status (creates/loads a wrapped DEK for the active label)
docker exec -it $BE python -m app.cli crypto-init
docker exec -it $BE python -m app.cli crypto-status

# Demo write/read (uses hybrid properties to encrypt/decrypt)
docker exec -it $BE python -m app.cli txn-demo --desc "Cappuccino" --raw "Blue Bottle #42" --note "extra foam"
docker exec -it $BE python -m app.cli txn-show-latest

# KEK rotation (rewrap only; fast — data stays under same DEK)
$NEW=[Convert]::ToBase64String((1..32 | % { Get-Random -Min 0 -Max 256 }))
docker exec -it $BE python -m app.cli kek-rewrap --new-kek-b64 $NEW

# After rewrap, use the NEW KEK for any decrypting command (until container env is updated/restarted):
docker exec -it -e ENCRYPTION_MASTER_KEY_BASE64=$NEW -e MASTER_KEK_B64=$NEW $BE python -m app.cli txn-show-latest
```

Notes

- Rewrap rotates the KEK only. Data remains encrypted with the same DEK; only the DEK wrapper is changed.
- If decrypt fails with InvalidTag after rewrap, ensure your process/env uses the new KEK (update compose env and restart, or inject via `docker exec -e ...`).
- Backup `encryption_keys` along with your data. Don’t index encrypted blobs; index plaintext analytics columns (date, amount, merchant_canonical, category).

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
- `FORCE_HELP_LLM=1|0` — test-only override for the `/agent/describe/{panel}` help summaries. Truthy (`1,true,yes,on`) forces the rephrase (LLM) branch regardless of normal policy flags; falsy (`0,false,no,off`) hard-disables it. Highest precedence except that a global disable in the policy will still clear cache state. Replaces the removed internal `_llm_enabled` shim—use this in tests instead of monkeypatching private functions.
- `HELP_REPHRASE_DEFAULT=1|0` — sets the default for the `rephrase` query param on describe endpoints when it is omitted (tests often set to `0` so explicit `?rephrase=1` drives behavior).

These are read by `app/utils/csrf.py`, `app/services/llm.py`, and some test helpers.

---

## Hermetic Test Run (Windows / PowerShell)

Prereqs

- Python 3.11+ with virtualenv
- `pip install -r apps/backend/requirements.txt` (+ `requirements-dev.txt` if present)

Run

```powershell
pwsh ./test.ps1
```

What the script does

- Sets `PYTHONPATH` to `apps/backend` (single import root)
- Purges `__pycache__` / `*.pyc` inside backend only
- Prints a preflight (paths for `app`, `agent_tools`, `agent_router`)
- Executes `pytest -q --import-mode=importlib tests`

Common pitfalls

- Duplicate tree like `apps/backend/apps/backend/...` → remove stray nested copy
- Site‑packages shadowing source → ensure preflight shows workspace paths
- KMS / LLM dependent tests skipped unless env vars / credentials provided

Key env flags set automatically (see `tests/conftest.py` + `_hermetic_env` fixture):
`APP_ENV=test`, `DEV_ALLOW_NO_LLM=1`, `DEV_ALLOW_NO_AUTH=1`, `DEV_ALLOW_NO_CSRF=1`.

To run with real LLM / auth remove or override those in your shell before invoking pytest.

Add coverage (optional):

```powershell
python -m pytest --cov=app --cov-report=term-missing
```

Warn filtering
Targeted filters are in `pytest.ini`; adjust after copying exact warning messages instead of using blanket ignores.

---

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
