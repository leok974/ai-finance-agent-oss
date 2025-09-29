# AI Finance Agent (gpt-oss:20b)

> Production-ready personal finance + LLM agent stack (FastAPI + React + Ollama/OpenAI) with KMS-backed encryption, Cloudflare tunnel ingress, and hardened nginx edge.

## Quick Start (Prod Compose Path)

```bash
git clone https://github.com/leok974/ai-finance-agent-oss.git
cd ai-finance-agent-oss

# 1. Provide env (minimal example)
cat > .env <<'EOF'
ENCRYPTION_ENABLED=1
GCP_KMS_KEY=projects/ledgermind-03445-3l/locations/global/keyRings/ledgermind/cryptoKeys/backend
GCP_KMS_AAD=app=ledgermind,env=prod
MODEL=gpt-oss:20b
# Optional fallback OpenAI
OPENAI_API_KEY=sk-...   # or placed as secret file
EOF

# 2. Place GCP service account JSON (not committed)
mkdir -p secrets/gcp-sa.json
cp /path/to/ledgermind-backend-sa.json secrets/gcp-sa.json/ledgermind-backend-sa.json

# 3. Start stack (Docker Desktop context example)
docker --context desktop-linux compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d

# 4. Verify
curl -s https://app.ledger-mind.org/ready | jq
```

Access the app via: https://app.ledger-mind.org

> Security Note: `.env` is git-ignored and may include sensitive values (KMS keys, tunnel tokens, API keys). Never commit real secrets. For Cloudflare tunnel token mode add `CLOUDFLARE_TUNNEL_TOKEN=...` to `.env` (or use `secrets/cloudflared_token.txt` with the helper script `scripts/tunnel-token-fingerprint.ps1`). Rotate immediately if you suspect exposure.

Additional verification & smoke steps: see [`docs/VERIFY_PROD.md`](docs/VERIFY_PROD.md).

### Bootstrap Scripts

Automate first-time or repeat prod stack bring-up with generated secrets, readiness gating, migration drift handling, JSON summaries, and optional authenticated smoke.

PowerShell (Windows):
```powershell
# Fresh full stack; allow missing LLM; 2‑min readiness; auto-migrate if drift
pwsh .\scripts\prod-bootstrap.ps1 -ResetPg -NoLLM -Full -ReadyTimeoutSec 120 -AutoMigrate

# CI-friendly JSON summary + authenticated smoke prompt
pwsh .\scripts\prod-bootstrap.ps1 -Full -Json -SmokeAuth

# Minimal (just postgres+backend, default timeout)
pwsh .\scripts\prod-bootstrap.ps1
```

Bash (Linux / CI):
```bash
./scripts/prod-bootstrap.sh -ResetPg -NoLLM -Full -ReadyTimeoutSec 120 -AutoMigrate -Json
```

Flags:
| Flag | Purpose |
|------|---------|
| `-ResetPg` | Drop and recreate Postgres volume (`pgdata`) |
| `-NoLLM` | Allow startup without an LLM key (sets `DEV_ALLOW_NO_LLM=1` if absent) |
| `-Full` | Also start nginx, agui, cloudflared, certbot, nginx-reloader |
| `-ReadyTimeoutSec <n>` | Max seconds to wait for `/api/status` (db + migrations) |
| `-SmokeAuth` (PS only) | Run full smoke with interactive auth (prompts for password) |
| `-Json` | Emit final machine-readable summary to stdout |
| `-AutoMigrate` | Run `alembic upgrade head` automatically on drift |

Readiness Criteria:
- `/api/status` must report `ok=true`, `db.ok=true`, `migrations.ok=true`.
- With `-Json`, a timeout prints `{ "ok": false, "reason": "timeout", "url": "..." }` and exits non-zero.

Sample Summary (plain):
```
SUMMARY | ok=True db=True mig=True crypto=True llm=True t=42ms url=https://app.ledger-mind.org
```

Sample JSON:
```json
{
  "ok": true,
  "db_ok": true,
  "mig_ok": true,
  "mig_cur": "1a2b3c4d",
  "mig_head": "1a2b3c4d",
  "crypto_ok": true,
  "llm_ok": true,
  "t_ms": 42,
  "drift": false,
  "url": "https://app.ledger-mind.org"
}
```

If drift is detected and `-AutoMigrate` not set, a command hint is printed. With `-AutoMigrate`, migrations are applied and status is re-queried.

Both scripts generate `.env.prod.local` once (idempotent). Delete that file to rotate values.

### Unified Bootstrap Endpoint

The backend exposes a lightweight consolidated status at `/api/status` returning:

```
{
  "ok": true,
  "ts": 1730000000,
  "auth": { "logged_in": false, "email": null },
  "version": { "backend_branch": "main", "backend_commit": "abc1234" },
  "llm": { "ready": true },
  "health": { "ready": true }
}
```

Frontend can call this once at boot to decide whether to render a logged-out shell **without** immediately triggering `/api/auth/me` / charts calls when unauthenticated. This reduces unnecessary 401/404 noise and speeds first paint.

### Post-Deploy Cloudflare Cache Purge (HTML + Current Assets)

After each production rebuild, purge stale cached HTML and reference the newly built hashed assets so users never load an index.html pointing at old JS/CSS.

Quick usage (requires Zone cache purge token):

```powershell
$env:CLOUDFLARE_API_TOKEN="***"
$env:CLOUDFLARE_ZONE_ID="***"
pwsh -File scripts/cf-purge.ps1
```

Or via npm script:

```bash
CLOUDFLARE_API_TOKEN=*** CLOUDFLARE_ZONE_ID=*** npm run cf:purge
```

What it purges:
- / (root)
- /index.html
- All /assets/*.js and *.css referenced in the built `apps/web/dist/index.html`
- Extra entries (default: /site.webmanifest, /favicon.ico)

CI step example:
```yaml
- name: Purge Cloudflare cache
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ZONE_ID: ${{ secrets.CLOUDFLARE_ZONE_ID }}
  run: |
    node scripts/cf-purge.js \
      --base=https://app.ledger-mind.org \
      --dist=apps/web/dist \
      --extra=/site.webmanifest,/favicon.ico
- name: Edge smoke
  run: pwsh -File scripts/smoke-edge.ps1
```

Scripts:
- `scripts/cf-purge.js` (Node implementation)
- `scripts/cf-purge.ps1` PowerShell wrapper

These ensure the CDN never serves stale HTML pointing at removed hashed bundles (avoids text/plain module errors and white screens).

#### Advanced Purge Modes

Changed-only (hash compare on `index.html`):
```bash
npm run cf:purge:changed \
  --silent # (optional) suppress npm prefix
```

Dry run (show what would purge, skip API call):
```bash
npm run cf:purge:dry
```

Direct Node invocation examples:
```bash
node scripts/cf-purge.js \
  --base=https://app.ledger-mind.org \
  --dist=apps/web/dist \
  --onlyIfChanged=1 \
  --snapshot=.cf-purge.last.json

# Force purge even if unchanged (omit onlyIfChanged)
node scripts/cf-purge.js --base=https://app.ledger-mind.org --dist=apps/web/dist

# Dry run + verbose backoff settings
node scripts/cf-purge.js --base=https://app.ledger-mind.org --dist=apps/web/dist --onlyIfChanged=1 --dryRun=1 --retries=3 --backoffMs=400
```

Snapshot file (`.cf-purge.last.json`) persists:
```json
{
  "indexHash": "<sha256>",
  "at": "2025-09-28T19:22:11.311Z",
  "urls": ["https://app.ledger-mind.org/", "https://app.ledger-mind.org/index.html", "..."]
}
```

If `--onlyIfChanged=1` and current `index.html` hash matches `indexHash`, purge is skipped (fast exit 0).

Retry / backoff logic: exponential (2^n) * base `--backoffMs` (+ jitter) on 429 and 5xx up to `--retries` attempts.

Integrate into rebuild:
```powershell
pwsh -File scripts/rebuild-prod.ps1 -PurgeEdge
```
Adds a post-deploy changed-only purge (skips if unchanged, warns if env vars missing).

Environment requirements (unchanged):
```
CLOUDFLARE_API_TOKEN=...  # zone.cache_purge permission
CLOUDFLARE_ZONE_ID=...
```

Flags summary (cf-purge.js):
| Flag | Purpose | Default |
|------|---------|---------|
| `--base` | Public site base URL | (required) |
| `--dist` | Build output directory | `apps/web/dist` |
| `--extra` | CSV extra paths to purge | `/site.webmanifest,/favicon.ico` |
| `--onlyIfChanged` | Skip purge when index hash unchanged | off |
| `--snapshot` | Snapshot JSON path | `.cf-purge.last.json` |
| `--retries` | Retry attempts on 429/5xx | 5 |
| `--backoffMs` | Initial backoff ms | 500 |
| `--dryRun` | Log targets, no API call | off |

Credentials:
- Preferred: `CLOUDFLARE_API_TOKEN` (scoped token: Zone -> Cache Purge:Edit)
- Fallback (auto-detected if no token): `CLOUDFLARE_GLOBAL_KEY` + `CLOUDFLARE_EMAIL`

CI Dry-Run Workflow:
The workflow `cloudflare-purge-smoke.yml` performs a scheduled and on-change dry-run purge to ensure the script stays healthy without mutating cache:
```yaml
- name: Cloudflare purge dry-run (sanity)
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ZONE_ID:   ${{ secrets.CLOUDFLARE_ZONE_ID }}
  run: |
    node scripts/cf-purge.js \
      --base=https://app.ledger-mind.org \
      --dist=apps/web/dist \
      --extra=/site.webmanifest,/favicon.ico \
      --dryRun=1
```

Result codes:
| Exit | Meaning |
|------|---------|
| 0 | Purge success OR skipped (unchanged / dry-run) |
| 1 | Purge attempted and failed after retries |
| 2 | Usage / configuration error |

Operational recommendation: run changed-only purge in deploy pipeline; schedule a weekly full purge (without `--onlyIfChanged`) if you rotate rarely referenced assets.

## Environment Variables (Core Selection)

| Variable | Required | Description |
|----------|----------|-------------|
| `ENCRYPTION_ENABLED` | yes (prod) | `1` enables envelope encryption / KMS mode when credentials present |
| `GOOGLE_APPLICATION_CREDENTIALS` | yes | Path inside container to SA JSON (`/secrets/gcp-sa.json`) |
| `GCP_KMS_KEY` | yes (KMS) | Full resource id of KEK (see example above) |
| `GCP_KMS_AAD` | recommended | Additional authenticated data (e.g. `app=ledgermind,env=prod`) |
| `MODEL` | yes | Primary local model (e.g. `gpt-oss:20b`) |
| `OPENAI_BASE_URL` | optional | Fallback or alt provider base (Ollama/vLLM) |
| `OPENAI_API_KEY` / `OPENAI_API_KEY_FILE` | optional | Fallback LLM key; file path used in prod secret mount |
| `DISABLE_PRIMARY` | optional | `1` forces using fallback only (diagnostics) |
| `DEV_ALLOW_NO_LLM` | optional | Allow deterministic stubs when no model up (non-prod) |

Secrets policy: `secrets/` is git-ignored; place SA JSON under `secrets/gcp-sa.json/`.

## Services Overview

```
Browser ⇄ Cloudflare Edge ⇄ cloudflared (tunnel) ⇄ nginx (reverse proxy / static) ⇄ backend (FastAPI) ⇄ Postgres
                                                              └── ollama (LLM runtime)
                                                              └── agui (SSE gateway)
```

## Verification & Operations Docs

| Topic | Doc |
|-------|-----|
| Deployment readiness & curls | [`VERIFY_PROD.md`](docs/VERIFY_PROD.md) |
| Deployment checklist | [`DEPLOY_CHECKLIST.md`](docs/DEPLOY_CHECKLIST.md) |
| Cloudflare tunnel issues | [`TROUBLESHOOTING_CLOUDFLARE_TUNNEL.md`](docs/TROUBLESHOOTING_CLOUDFLARE_TUNNEL.md) |
| Crypto / KMS setup | [`CRYPTO_SETUP.md`](docs/CRYPTO_SETUP.md) |
| LLM primary & fallback config | [`LLM_SETUP.md`](docs/LLM_SETUP.md) |
| Smoke scripts overview | [`SMOKE_TESTS.md`](docs/SMOKE_TESTS.md) |
| Architecture overview | [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Testing strategy | [`TESTING.md`](docs/TESTING.md) |
| Security posture | [`SECURITY.md`](docs/SECURITY.md) |
| Day-2 operations | [`OPERATIONS.md`](docs/OPERATIONS.md) |
| Contributing guide | [`CONTRIBUTING.md`](docs/CONTRIBUTING.md) |
| Changelog | [`CHANGELOG.md`](CHANGELOG.md) |

## Common Issues & Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `crypto_ready:false` on /ready | SA JSON missing or `ENCRYPTION_ENABLED=0` | Mount file at `/secrets/gcp-sa.json`, set env, restart backend |
| 502 via edge, internal 200 | HTTPS origin mismatch (cloudflared → https://nginx:443, nginx only on :80) | Update tunnel ingress to `http://nginx:80` (see tunnel doc) |
| `models_ok` = `unknown` | Frontend expecting legacy `/llm/models` | Use `/agent/models` or rely on `useLlmStore().modelsOk` |
| Falling back to stub LLM | Primary model not loaded yet | Wait for Ollama pull / remove `DISABLE_PRIMARY` |

---

Offline-first finance agent with local inference via Ollama or vLLM. Designed for the Open Models hackathon.
- **Agentic**: function-calling tools for categorization, rules, budgets, and insights
- **Local**: point to your local LLM server (Ollama or vLLM) via env
- **Applies gpt-oss uniquely**: on-device, function-calling agent that explains its reasoning ("Explain Signal") and learns from user feedback (train->reclassify loop).
- **Natural Language Interface**: Revolutionary conversational transaction explanations - just say "Explain this coffee charge" and it works automatically.
- **Production-Grade Architecture**: Robust Pydantic validation, smart context trimming, PII redaction, and comprehensive hermetic test coverage.
- **Performance Optimized**: HTTP client reuse, token-aware context management, and intent-specific system prompts for better LLM responses.
- **Design**: clean UX, resilient states, deduped suggestions, one-click "Auto-apply best" with threshold.
- **Impact**: turns messy bank CSVs into actionable budgets & insights locally.
- **Novelty**: "Explain" turns category predictions into transparent traces (rules + LLM rationale).
- **Safe UX**: optimistic UI, loading/error states, no duplicate suggestions, explain-why
- **Smart Chat**: unified `/agent/chat` endpoint with natural language transaction explanations and auto-context enrichment

## Troubleshooting

If something feels off (e.g., API returns HTML, login refresh quirks, Cloudflare tunnel issues), see `troubleshooting.md` for quick fixes and copy-paste checks.

## ≡ƒÜÇ New: Enhanced Agent Chat System

### **Natural Language Transaction Explanations**
Now supports conversational transaction explanations without requiring explicit transaction IDs:
```bash
# Before: Required specific transaction ID
curl -X POST http://127.0.0.1:8000/agent/chat \
  -d '{"messages":[{"role":"user","content":"Explain transaction 123"}], "intent":"explain_txn", "txn_id":"123"}'

# After: Natural language works automatically
curl -X POST http://127.0.0.1:8000/agent/chat \
  -d '{"messages":[{"role":"user","content":"Explain this $4.50 coffee charge"}], "intent":"explain_txn"}'
```

### **Key Features**
- **≡ƒñû Smart Fallback**: Automatically finds relevant transactions when ID is missing
- **≡ƒÄ» Intent-Specific Behavior**: Specialized responses for `general`, `explain_txn`, `budget_help`, `rule_seed`
- **≡ƒôè Rich Citations**: Comprehensive context metadata (`summary`, `rules`, `merchants`, `alerts`, `insights`, `txn`)
- **ΓÜí Performance Optimized**: Smart context trimming and HTTP client reuse
- **≡ƒöÉ Privacy Protected**: PII redaction for secure logging
- **Γ£à Production Ready**: Full Pydantic validation with comprehensive test coverage

### **Agent Chat API**
```typescript
// TypeScript API (apps/web/src/lib/api.ts)
type AgentChatRequest = {
  messages: { role: 'system'|'user'|'assistant', content: string }[];
  context?: any;
  intent?: 'general'|'explain_txn'|'budget_help'|'rule_seed';
  txn_id?: string | null;
  model?: string;
  temperature?: number;
  top_p?: number;
};

type AgentChatResponse = {
  reply: string;
  citations: { type: string; id?: string; count?: number }[];
  used_context: { month?: string };
  tool_trace: any[];
  model: string;
};
```

### Web UI: ChatDock updates (Sep 2025)
- Unified messages stream persisted in `localStorage` at `financeAgent.chat.messages.v1` with crossΓÇætab sync via `BroadcastChannel`.
- Hydrates on mount and auto-scrolls to the latest message; history renders from the same stream.
- Header actions: Export chat as JSON or Markdown; History toggle; Tools toggle (with Lucide ChevronUp/Wrench icons).
- Accessible toggle uses `aria-expanded` + `aria-controls="agent-tools-panel"`; the tools panel is labeled with that id.
- Tiny tool presets run through `/agent/chat` and append back into the same messages stream; duplicate inline quick tools removed.
- Model selection (Advanced) is saved per-tab in `sessionStorage` under `fa.model`; leave blank to use backend default.
- ΓÇ£ExplainΓÇ¥ and other entry points now funnel into the same chat, so everything is captured and restorable.

### Backend resilience updates (Sep 2025)
- Insights enrichment is optional and non-fatal during `/agent/chat` context building; failures donΓÇÖt block a reply.
- Added a minimal `ExpandedBody` + `expand(...)` helper to normalize insights payloads defensively.
- Normalized citations and `used_context.month` metadata are returned to support UI annotations.

Tips
- Open the ChatDock from the floating bubble (≡ƒÆ¼) or with Ctrl+Shift+K.
- Export buttons live in the header (JSON/Markdown).
- The model selection (Advanced) is saved per tab; leave blank to use the backend default.
- Clearing the chat resets the persisted stream (synced across this browserΓÇÖs tabs).

## Quickstart

### Prereqs
- Python 3.11+
- Node 20+ (pnpm recommended)
- One local LLM server:
  - **Ollama**: `ollama run gpt-oss:20b`
  - **vLLM** (OpenAI-compatible): `python -m vllm.entrypoints.openai.api_server --model <path-or-hf-id>`

### 1) Configure env
```bash
cp .env.example .env
# Edit .env as needed
```

### 2) Backend
```bash
cd apps/backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -U pip
pip install -e .
uvicorn app.main:app --reload --port 8000
```
#### Create an admin user (CLI)
Once the backend is running (or inside the backend container), you can create/update a user and assign roles:

```bash
# Create or update a user and set roles (space-separated)
python -m app.cli users create --email "you@example.com" --password "changeme" --roles admin analyst user

# Alias form (same behavior)
python -m app.cli user-create --email "you@example.com" --password "changeme" --roles admin analyst user
```

Alternatively, seed the default admin:

```bash
python -m app.scripts.seed_admin   # admin@local / admin123
```

### 3) Frontend
```bash
cd ../../apps/web
npm i -g pnpm || true
pnpm install
pnpm dev  # http://localhost:5173/app/
```
Log in at http://localhost:5173/ with either your created user or the seeded admin credentials.

### 4) Load sample data
In the web UI, go to **CSV Ingest** and upload `transactions_sample.csv` from `apps/backend/app/data/samples/`.

---

# Finance Agent ΓÇö Setup & Notes

This branch (UI-update) focuses on UI/UX refinements and stability: unified toasts (single Toaster), actionable CTA toasts with smooth scroll to anchors, shared scroll helper, and removal of deprecated insights summary usage.

Complete test coverage with zero external dependencies:
- **ΓÜí Lightning Fast**: Tests run in seconds instead of minutes
- **≡ƒÄ» CI/CD Ready**: Works in any environment without API keys
- **≡ƒôï Comprehensive Coverage**: 15+ test scenarios covering all functionality
pytest tests/test_agent_chat.py -v


**Global Month Auto-Run**
- On UI startup, fetches `/agent/tools/meta/latest_month`.
- Auto-triggers "Insert Context" whenever month changes.
- Debounced + guarded to prevent "second click glitch."

**UI Upload Flow Simplified**
- Removed checkbox for "expenses are positive."
- Upload panel now just posts to `/ingest?replace=...`.
- Backend automatically infers if expenses should be flipped.

### Backend

**Meta Endpoints**
- `/agent/tools/meta/version` ΓåÆ shows current git branch + commit.
- `/agent/tools/meta/latest_month` ΓåÆ shows latest month in DB (e.g. "2025-08").

**CSV Ingest Improvements**
- New auto-detection logic: if most expense-like rows are positive, amounts are flipped automatically.
- Heuristic: ignores obvious income (payroll, deposits, refunds, etc.), samples up to 200 rows.
- Adds `flip_auto` field in response if flip was inferred.

Response shape:
```json
{ "ok": true, "added": 10, "count": 10, "flip_auto": true }
```

### Database
- Transactions table must exist (`alembic upgrade head` in backend container).
- Example:
```bash
docker exec -it finance-pg psql -U myuser -d finance -c "SELECT month, COUNT(*) FROM transactions;"
```

## ≡ƒÜÇ Local Dev via Docker Compose
### 1. Build & start stack
```bash
docker compose down -v   # optional: nuke DB volume
docker compose up --build
```

### 2. Run migrations
```powershell
$BE = (docker ps --format "{{.Names}}" | Select-String -Pattern "backend" | ForEach-Object { $_.ToString() })
docker exec -it $BE alembic upgrade head
```

### 2.1. Create an admin (in-container)
```powershell
docker exec -it $BE python -m app.cli users create --email "you@example.com" --password "changeme" --roles admin analyst user
# or seed default:
docker exec -it $BE python -m app.scripts.seed_admin
```

### 3. Ingest CSV
Example with provided sample:
```powershell
curl.exe -X POST `
  -F "file=@C:\ai-finance-agent-oss\apps\backend\app\data\samples\transactions_sample.csv" `
  "http://127.0.0.1:8000/ingest?replace=true"
```

Response should include `"flip_auto": true` if your CSV has positive expenses.

### 4. Verify
```powershell
# Check latest month
Invoke-WebRequest -UseBasicParsing -Method POST http://127.0.0.1:8000/agent/tools/meta/latest_month | Select -Expand Content

# DB peek
docker exec -it finance-pg psql -U myuser -d finance -c "SELECT MAX(date), month, COUNT(*) FROM transactions GROUP BY month ORDER BY month DESC;"
```

## Γ£à Expected Behavior
- On UI startup ΓåÆ global month is set to latest (2025-08 with sample CSV).
- After CSV upload ΓåÆ global month updates automatically, charts & insights refresh.
- Insert Context ΓåÆ auto-runs whenever month changes (no more manual clicks needed).
- Run Button ΓåÆ works without glitching on second click.
- Expenses ΓåÆ correctly negative regardless of CSV sign convention.

## ≡ƒöº Troubleshooting

**`web-1 exited with code 1` during compose**
ΓåÆ Make sure `smoke-backend.ps1` is not called in containerized environments (Windows-only).

**`relation "transactions" does not exist`**
ΓåÆ Run migrations inside backend container:
```bash
docker exec -it <backend_container> alembic upgrade head
```

**Latest month looks wrong**
ΓåÆ Check DB directly:

## Runtime Diagnostics: /config Endpoint

`GET /config` returns a lightweight, non-sensitive snapshot of runtime flags to help verify deployment behavior:

Field | Meaning
----- | -------
`env` | Current environment (dev / prod / etc.)
`debug` | Whether debug mode is enabled
`help_rephrase_default` | Default value used when `rephrase` query param is omitted on `/agent/describe/*`
`help_cache` | Object with `hits`, `misses`, and `size` (entry count) for the help/describe TTL cache

Example:
```json
{
  "env": "dev",
  "debug": true,
  "help_rephrase_default": true,
  "help_cache": {"hits": 12, "misses": 4, "size": 3}
}
```

## Dev Override: Enabling Rephrase Locally

By default the LLM rephrase polish is only active in production. To exercise the rephrase path (and provider fallback) in dev without faking `ENV=prod`, set:

```
LLM_ALLOW_IN_DEV=1
HELP_REPHRASE_DEFAULT=1
```

You can inject these via `docker-compose.override.yml`:

```yaml
services:
  backend:
    environment:
      - LLM_ALLOW_IN_DEV=1
      - HELP_REPHRASE_DEFAULT=1
```

Then restart the backend container. Subsequent `POST /agent/describe/<panel>?rephrase=1` calls should return `rephrased: true` (unless the model response equals the deterministic base text).

## Help Cache Stats

The in-memory help cache tracks simple counters:

Metric | Definition
------ | ----------
`hits` | Successful cache lookups (non-expired)
`misses` | Key not found or expired
`size` | Current number of live (non-expired) entries

These reset on backend restart or when the cache is cleared in tests.
```bash
docker exec -it finance-pg psql -U myuser -d finance -c "SELECT MAX(date) FROM transactions;"
```

## Admin

Operations helpers:

- `POST /admin/help-cache/reset` — clears the help describe cache and resets its counters.
  - Optional header: `x-admin-token: $ADMIN_TOKEN` (enforced only if `ADMIN_TOKEN` env var is set)

Example (PowerShell):
```powershell
Invoke-RestMethod -Method POST http://127.0.0.1:8000/admin/help-cache/reset -Headers @{ "x-admin-token" = $env:ADMIN_TOKEN }
```

## Metrics

If Prometheus is enabled (either via `prometheus_fastapi_instrumentator` or manual mounting), the help cache also exports:

- `help_cache_hits_total`
- `help_cache_misses_total`
- `help_cache_evictions_total`
- `help_cache_entries` (gauge)

These update in real time; eviction increments occur when an expired entry is accessed.

## LLM Gating

All LLM usage is centralized through `llm_policy(mode)` in `app/services/llm_flags.py`.

Precedence (highest wins):

1. `FORCE_LLM_TESTS=1` – test-only override; forces allow (sets `forced=True`).
2. `DEV_ALLOW_NO_LLM=1` – global dev/test off switch (`globally_disabled=True`).
3. `LLM_ALLOW_IN_DEV=1` – allow in non-prod environments.
4. Production default: allow when `ENV=prod` (or `APP_ENV=prod`) and `DEBUG` is not truthy.

`llm_policy` returns a dict: `{ allow: bool, forced: bool, globally_disabled: bool }`.

Callers (describe, explain, chat) request a policy via `llm_policy("help"|"explain"|"chat")` and must treat `allow` as authoritative. Query params like `?use_llm=1` act only as hints; the policy decides final permission.

### LLM gating in tests

Use these env vars to exercise different paths:

- Force on (tests only): `FORCE_LLM_TESTS=1`
- Global dev disable: `DEV_ALLOW_NO_LLM=1`
- Allow in dev: `LLM_ALLOW_IN_DEV=1`

Precedence: `FORCE_LLM_TESTS` > `DEV_ALLOW_NO_LLM` > `LLM_ALLOW_IN_DEV` > prod fallback.

When `globally_disabled` is true we also purge any cached rephrased variants to avoid serving stale LLM outputs.


---

## Month handling and data refresh
- The app initializes the UI month from your data automatically by calling the transactions search tool without a month; the backend returns the latest month it finds.
- Charts endpoints require an explicit `month`. The UI always passes it, and the Chat Dock auto-injects the current month for month-required tools.
- After a successful CSV upload, the app snaps the global month to the latest available and refreshes dashboards in the background (non-blocking).

## UI updates (Sep 2025)
- Unified notifications with a single shadcn-style Toaster mounted once in the web app.
- Added CTA-rich success toasts across key actions (rule create/apply, unknowns seed, CSV upload) with buttons to jump to charts or unknowns.
- Introduced page anchors (`#charts-panel`, `#unknowns-panel`, `#rule-tester-anchor`) plus a shared `scrollToId` helper for smooth in-page navigation.

## Environment
- `OPENAI_BASE_URL` (e.g. `http://localhost:11434/v1` for Ollama, or your vLLM URL)
- `OPENAI_API_KEY` (dummy like `ollama` for Ollama, or your real key for remote servers)
- `MODEL` (default `gpt-oss:20b`)
- `DEV_ALLOW_NO_LLM=1` to use deterministic stubbed suggestions if LLM is down

### OpenAI key via Docker secret (prod)

In production, avoid passing `OPENAI_API_KEY` via environment variables.

- Put your key in `./secrets/openai_api_key` (file contents is just the key string, no quotes or KEY= prefix).
- Do not commit this file. The repo already ignores `secrets/` and keeps `secrets/.keep` for the folder.
- Compose mounts it at `/run/secrets/openai_api_key` and sets `OPENAI_API_KEY_FILE` for the backend in `docker-compose.prod.yml`.
- The backend loads the key from `OPENAI_API_KEY` (env) when present (dev/local), otherwise from `OPENAI_API_KEY_FILE` (defaults to `/run/secrets/openai_api_key`).

Verify (PowerShell):

1) Rebuild and start backend with prod compose overrides:
  - $files = @('-f','docker-compose.prod.yml','-f','docker-compose.prod.override.yml')
  - docker compose $files up -d --build backend

2) Check secret is mounted inside the container:
  - $be = (docker ps --format "{{.Names}}" | Select-String "backend").ToString()
  - docker exec -it $be sh -lc 'ls -l /run/secrets && wc -c </run/secrets/openai_api_key'

3) Functional smoke:
  - curl -s -i https://app.ledger-mind.org/agent/chat -H "Content-Type: application/json" --data '{"messages":[{"role":"user","content":"ping"}],"stream":false}'

Expected: 200 (or friendly response) and no server-side "missing_config" errors if the secret file exists.

Windows note (Docker Desktop): if you hit a bind mount error for `secrets/openai_api_key`, use the local override to pass the key via env just for local prod testing:

1) In PowerShell for the current session only:
  - `$env:OPENAI_API_KEY = '<your-key-here>'`
2) Start backend with prod compose overrides:
  - `docker compose -f docker-compose.prod.yml -f docker-compose.prod.override.yml up -d backend`
3) In real production on Linux hosts, keep using the Docker secret mount (more secure) and do not pass the key as an env var.

### Analytics retention (prod)

To keep analytics data bounded over time, the backend can run a small background job in production that prunes old rows from `analytics_events`.

- ANALYTICS_RETENTION_DAYS: days of data to keep (default 90)
- ANALYTICS_RETENTION_INTERVAL_HOURS: how often to prune (default 24)

Notes
- The job only runs when `APP_ENV=prod` (or `ENV=prod`).
- Pruning is a simple `DELETE FROM analytics_events WHERE server_ts < :cutoff` and works for both Postgres and SQLite.
- A Postgres partial index on the hot event `chat_fallback_used` is included via Alembic for faster queries:
  - idx_ae_fallback_event on `server_ts` where `event='chat_fallback_used'`.

After pulling this change, apply migrations:

PowerShell (Docker)
1) $BE = (docker ps --format "{{.Names}}" | Select-String -Pattern "backend").ToString()
2) docker exec -it $BE alembic upgrade head

Bare metal (venv)
- From `apps/backend`, ensure your venv is active and Alembic is installed, then run:
  - python -m pip install --upgrade pip setuptools wheel alembic
  - python -m alembic upgrade head

Verification
- On Postgres: `\di+ idx_ae_*` should show the new partial index.
- Logs will periodically include `analytics_retention: pruned <N> rows...` when enabled.

### Grafana dashboard: Fallback analytics

We ship a ready-to-import Grafana dashboard JSON for monitoring LLM fallback behavior and rates:

- File: `ops/grafana/ledgermind-fallback-dashboard.json`
- Datasource: PostgreSQL (select your Postgres datasource during import)

Import steps
1) In Grafana, go to Dashboards → New → Import.
2) Upload the JSON file from `ops/grafana/ledgermind-fallback-dashboard.json`.
3) When prompted, choose your PostgreSQL datasource and click Import.

Panels included
- Fallbacks (count) over time filtered by the dashboard time range.
- Fallbacks by provider (stacked), reading `props_json->>'provider'`.
- Fallback rate = fallbacks / chat attempts per minute.

## Repo layout
```
apps/
  backend/   - FastAPI app (ingest, charts, insights, agent tools, tests)
  web/       - Vite/React web app (UI, charts, chat)
scripts/     - Windows helpers (dev, run-ollama)
docker-compose.yml
```

## Dev scripts (Windows)
- `scripts/dev.ps1` ΓÇö starts Ollama (pulls model), backend (Uvicorn), and frontend (Vite) in parallel and streams logs.
  - Parameters: `-Model gpt-oss:20b` (default), `-Py .venv/\Scripts/\python.exe` to point at your venv.
- `scripts/run-ollama.ps1` ΓÇö ensures Ollama is running, pulls the model, and performs a quick generation test.

Tip: In PowerShell, you may need to allow script execution for your repo path: `Set-ExecutionPolicy -Scope Process Bypass`.

## Encryption & Key Management (Sep 2025)

The backend now supports envelope encryption for sensitive free‑text fields on transactions (`description`, `merchant_raw`, `note`).

Core concepts
- **DEK (Data Encryption Key)**: 32‑byte key used to encrypt individual field values (AES‑GCM). Stored only wrapped.
- **KEK / KMS**: Either a symmetric key from env (`ENCRYPTION_MASTER_KEY_BASE64` / `MASTER_KEK_B64`) or a Google Cloud KMS key (`GCP_KMS_KEY`) that wraps the DEK.
- **Labels**: Each wrapped DEK row in `encryption_keys` has a `label` (e.g. `active`, `rotating::<ts>`, `retired::<ts>`). Writes reference the current write label (cached via `encryption_settings.write_label`).
- **Hybrid Properties**: ORM exposes `*_text` accessors that transparently encrypt/decrypt using the in‑process decrypted DEK.

Minimal setup (env KEK mode)
```bash
export ENCRYPTION_ENABLED=1
export ENCRYPTION_MASTER_KEY_BASE64=$(openssl rand -base64 32)
alembic upgrade head
python -m app.cli crypto-init     # creates + caches active DEK
```

KMS mode (GCP Cloud KMS)
```bash
export GCP_KMS_KEY="projects/<proj>/locations/<loc>/keyRings/<ring>/cryptoKeys/<key>"
# Optional additional authenticated data
export GCP_KMS_AAD="finance-agent-v1"
alembic upgrade head
python -m app.cli crypto-init
```

Status & demo
```bash
python -m app.cli crypto-status
python -m app.cli txn-demo --desc "Latte" --raw "Blue Bottle #42" --note "extra foam"
python -m app.cli txn-show-latest
```

Key lifecycle
1. `crypto-init` unwraps & caches the active DEK (env or KMS wrapped).
2. Application encrypts new writes to encrypted columns with current DEK; legacy plaintext columns (if any) are backfilled via script.
3. Rotation uses a generate → re‑encrypt → finalize pattern.

DEK rotation (multi‑step)
```bash
# 1) Begin: insert new rotating::<ts> row & set as write label
python -m app.cli dek-rotate-begin

# 2) Re-encrypt batches from old label to new (repeat until remaining=0)
python -m app.cli dek-rotate-run --new-label rotating::20250920T120501

# 3) Finalize: promote rotating label to active, retire old active
python -m app.cli dek-rotate-finalize --new-label rotating::20250920T120501
```

KEK rewrap (fast, no data rewrite)
```bash
# Generate a new KEK and rewrap active DEK
NEW=$(openssl rand -base64 32)
python -m app.cli kek-rewrap --new-kek-b64 "$NEW"
# Or move env-wrapped DEK into KMS mode
python -m app.cli kek-rewrap-gcp
```

Force new active DEK (only when no encrypted rows yet)
```bash
python -m app.cli force-new-active-dek
```

Backfill legacy plaintext → encrypted columns
```bash
python -m app.scripts.encrypt_txn_backfill_splitcols
```

Operational guidance
- ALWAYS back up `encryption_keys` table alongside your data before rotations.
- Treat loss of KEK / KMS permissions as catastrophic: you cannot decrypt existing ciphertext.
- Use `crypto-status` in readiness probes if you need to ensure DEK is cached before serving traffic.
- Logs intentionally omit plaintext; debug locally if you need plaintext visibility.

Testing
- Hermetic tests run with DEV flags; encryption tests cover KEK/KMS unwraps and rotation scaffolding.
- To simulate KMS locally, leave `dek_wrap_nonce` NULL and set `GCP_KMS_KEY` (mock implementation or skip).

Future hardening ideas
- Add per-field metadata hashing for tamper detection.
- Integrate envelope key rotation metrics into a Prometheus endpoint.
- Streaming re-encryption job scheduler for large datasets.

Deep dive: see `docs/encryption.md` for rotation vs rewrap diagrams, metrics, and recovery scenarios.


## Agent Chat
- Minimal chat is available in the web app (uses backend `POST /agent/chat`).
- Point `OPENAI_BASE_URL` and `OPENAI_API_KEY` to your local/remote LLM server; default model is `gpt-oss:20b`.

## Agent Tools: Insights and Charts

### Insights (expanded)
POST `/agent/tools/insights/expanded`

Request (example):

```json
{ "month": "2025-08", "large_limit": 10 }
```

Notes
- This replaces prior summary-style endpoints. Legacy `/report` and `/insights/summary` are deprecated/removed.
- `month` is optional; when omitted, the backend uses the latest month in your data.
- Response includes `summary` (income/spend/net), `mom` deltas when available, `unknown_spend`, `top_categories`, `top_merchants`, `large_transactions`, and basic `anomalies`.

### Charts (month required)
POST `/agent/tools/charts/summary`

```json
{ "month": "2025-08" }
```

POST `/agent/tools/charts/merchants`

```json
{ "month": "2025-08", "limit": 10 }
```

POST `/agent/tools/charts/flows`

```json
{ "month": "2025-08" }
```

POST `/agent/tools/charts/spending_trends`

```json
{ "months": ["2025-03", "2025-04", "2025-05", "2025-06", "2025-07", "2025-08"], "order": "asc" }
```

Notes
- Charts endpoints require a month (or months list for trends). The UI injects the selected month automatically.

## Dev tips
- Windows PowerShell: activate venv with `.venv\Scripts\Activate.ps1`.
- Optional backend smoke check script lives under `apps/backend/app/scripts/smoke-backend.ps1` (used by the web smoke script).

## Why this will impress judges
- **Applies gpt-oss uniquely**: on-device, function-calling agent that explains its reasoning (ΓÇ£Explain SignalΓÇ¥) and learns from user feedback (train->reclassify loop).
- **Design**: clean UX, resilient states, deduped suggestions, one-click ΓÇ£Auto-apply bestΓÇ¥ with threshold.
- **Impact**: turns messy bank CSVs into actionable budgets & insights locally.
- **Novelty**: ΓÇ£ExplainΓÇ¥ turns category predictions into transparent traces (rules + LLM rationale).

## Agent Tools: Budget

### 1) Summary
POST `/agent/tools/budget/summary`

Request:

```json
{ "month": "2025-08", "top_n": 5 }
```

Response (shape):

```json
{
  "month": "2025-08",
  "total_outflows": 263.08,
  "total_inflows": 5000.0,
  "net": 4736.92,
  "unknown_count": 1,
  "by_category": [{ "category": "Groceries", "spend": 185.25, "txns": 2 }, ...],
  "top_merchants": [{ "merchant": "Costco", "spend": 120.0, "txns": 1 }, ...]
}
```

### 2) Check
POST `/agent/tools/budget/check`

Request:

```json
{
  "month": "2025-08",
  "limits": { "Groceries": 200, "Transport": 50, "Shopping": 100, "Subscriptions": 20 },
  "include_unknown": true
}
```

Response (shape):

```json
{
  "month": "2025-08",
  "items": [
    { "category": "Groceries", "limit": 200.0, "spend": 185.25, "remaining": 14.75, "utilization": 0.926 }
  ],
  "totals": { "spend": 263.08, "limit": 370.0, "remaining": 106.92, "utilization": 0.711 }
}
```

Notes

- Outflows are treated as positive spend (absolute value of negative amount).
- Unknown categories include NULL, empty string, and "Unknown" case-insensitive.
- `top_n` caps categories / merchants returned by the summary.

---

## 4) Run just these tests

```bash
cd apps/backend
.\.venv\Scripts\python.exe -m pytest -q tests/test_agent_tools_budget.py --maxfail=1
```
