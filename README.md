# AI Finance Agent (gpt-oss:20b)

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

## Judge Login quickstart (Sep 2025)

Make demo login trivial with a pre-provisioned account.

Backend envs
- DEMO_MODE=1 (enable route)
- DEMO_LOGIN_EMAIL=admin@local (default)
- DEMO_LOGIN_PASSWORD=admin123 (default)
- DEMO_LOGIN_TOKEN=<long-random-string> (required for one‑click)

One‑click URL
- {API_BASE}/auth/demo_login?token=<DEMO_LOGIN_TOKEN>

Cookie/CORS hints
- Dev: COOKIE_SECURE=0, COOKIE_SAMESITE=lax, CORS_ALLOW_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
- Hosted over HTTPS and cross‑site: COOKIE_SECURE=1, COOKIE_SAMESITE=none, set COOKIE_DOMAIN and allow the frontend origin in CORS_ALLOW_ORIGINS.

Docker Compose override
- Copy `docker-compose.override.example.yml` → `docker-compose.override.yml` and adjust values.

Optional frontend toggles
- VITE_DEMO_MODE=1 (shows one‑click link when token is present)
- VITE_DEMO_LOGIN_EMAIL / VITE_DEMO_LOGIN_PASSWORD (prefill)
- VITE_DEMO_LOGIN_TOKEN (used to build the one‑click link)

Sample .env (dev)
```
APP_ENV=dev
DEMO_MODE=1
DEMO_LOGIN_EMAIL=admin@local
DEMO_LOGIN_PASSWORD=admin123
DEMO_LOGIN_TOKEN=please-change-me
COOKIE_SECURE=0
COOKIE_SAMESITE=lax
CORS_ALLOW_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

Verify (PowerShell)
```
./scripts/verify-demo-login.ps1 -Base http://127.0.0.1:8000 -Email admin@local -Password admin123
```

Troubleshooting
- 404 demo login disabled → set DEMO_MODE=1.
- 403 invalid token → pass the exact DEMO_LOGIN_TOKEN in the URL.
- One‑click works but app not logged in → check cookie flags; for cross‑site use SameSite=None + Secure over HTTPS and set COOKIE_DOMAIN.

## 🚀 New: Enhanced Agent Chat System

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
- **🤖 Smart Fallback**: Automatically finds relevant transactions when ID is missing
- **🎯 Intent-Specific Behavior**: Specialized responses for `general`, `explain_txn`, `budget_help`, `rule_seed`
- **📊 Rich Citations**: Comprehensive context metadata (`summary`, `rules`, `merchants`, `alerts`, `insights`, `txn`)
- **⚡ Performance Optimized**: Smart context trimming and HTTP client reuse
- **🔐 Privacy Protected**: PII redaction for secure logging
- **✅ Production Ready**: Full Pydantic validation with comprehensive test coverage

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
  citations?: { type: string; id?: string; count?: number; url?: string; month?: string }[];
  used_context?: { month?: string };
  tool_trace?: any[];
  model?: string;
  mode?: 'general'|'nl_txns'|'charts'|'report'|'budgets'|'chain';
  artifacts?: { pdf_url?: string; excel_url?: string; merchants?: Array<{ merchant: string; spend: number; txns?: number }> };
};
```

### Planner + chain mode (Sep 2025)
- The chat router detects multi-intent prompts (e.g., contains "and"/"then"/"also" or mentions "pdf").
- It plans a short tool sequence and executes deterministically (charts/report tools only):
  - Allowed tools: `charts.merchants`, `charts.summary`, `report.pdf`, `report.excel`.
  - Clamped to at most 3 steps for safety.
  - Planner is rate-limited (~10 req/min) to avoid hammering your local LLM.
- Response shape when a plan runs:
  - `mode: "chain"` with `artifacts` like `{ pdf_url, excel_url, merchants[] }` and a `tool_trace`.
  - The reply includes a concise one-liner plus inline links when available.

Dev-only planner debugger is available; see below.

Apply with “Export report” will download the monthly Excel automatically. If the backend includes a report_url hint, the UI uses it; otherwise it falls back to a local Excel builder.

### Web UI: ChatDock updates (Sep 2025)
- Unified messages stream persisted in `localStorage` at `financeAgent.chat.messages.v1` with cross‑tab sync via `BroadcastChannel`.
- Hydrates on mount and auto-scrolls to the latest message; history renders from the same stream.
- Header actions: Export chat as JSON or Markdown; History toggle; Tools toggle (with Lucide ChevronUp/Wrench icons).
- Accessible toggle uses `aria-expanded` + `aria-controls="agent-tools-panel"`; the tools panel is labeled with that id.
- Tiny tool presets run through `/agent/chat` and append back into the same messages stream; duplicate inline quick tools removed.
- Model selection (Advanced) is saved per-tab in `sessionStorage` under `fa.model`; leave blank to use backend default.
- “Explain” and other entry points now funnel into the same chat, so everything is captured and restorable.

### Backend resilience updates (Sep 2025)
- Insights enrichment is optional and non-fatal during `/agent/chat` context building; failures don’t block a reply.
- Added a minimal `ExpandedBody` + `expand(...)` helper to normalize insights payloads defensively.
- Normalized citations and `used_context.month` metadata are returned to support UI annotations.

Tips
- Open the ChatDock from the floating bubble (💬) or with Ctrl+Shift+K.
- Export buttons live in the header (JSON/Markdown).
- The model selection (Advanced) is saved per tab; leave blank to use the backend default.
- Clearing the chat resets the persisted stream (synced across this browser’s tabs).

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

### Alembic on Docker + Postgres note

If Alembic fails on Postgres with `value too long for type character varying(32)` while inserting a long revision into `public.alembic_version`, widen the column once:

- New installs are safe: we configured Alembic to use a wider key (`VARCHAR(64)`) in `apps/backend/alembic/env.py`.
- For existing DBs, run this one-time alter in the Postgres container, then rerun migrations:

```powershell
# See running containers (names typically: ai-finance-agent-oss-backend-1, finance-pg)
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

# Widen the alembic version column
docker exec -i finance-pg psql -U myuser -d finance -c "ALTER TABLE public.alembic_version ALTER COLUMN version_num TYPE VARCHAR(64);"

# Apply migrations from backend container
docker exec -i ai-finance-agent-oss-backend-1 alembic upgrade head
```

### 3) Frontend
```bash
cd ../../apps/web
npm i -g pnpm || true
pnpm install
pnpm dev  # http://localhost:5173/app/
```

### 4) Load sample data
In the web UI, go to **CSV Ingest** and upload `transactions_sample.csv` from `apps/backend/app/data/samples/`.

---

# Finance Agent — Setup & Notes

This branch (UI-update) focuses on UI/UX refinements and stability: unified toasts (single Toaster), actionable CTA toasts with smooth scroll to anchors, shared scroll helper, and removal of deprecated insights summary usage.

Complete test coverage with zero external dependencies:
- **⚡ Lightning Fast**: Tests run in seconds instead of minutes
- **🎯 CI/CD Ready**: Works in any environment without API keys
- **📋 Comprehensive Coverage**: 15+ test scenarios covering all functionality
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
- `/agent/tools/meta/version` → shows current git branch + commit.
- `/agent/tools/meta/latest_month` → shows latest month in DB (e.g. "2025-08").

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

## 🚀 Local Dev via Docker Compose
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

## ✅ Expected Behavior
- On UI startup → global month is set to latest (2025-08 with sample CSV).
- After CSV upload → global month updates automatically, charts & insights refresh.
- Insert Context → auto-runs whenever month changes (no more manual clicks needed).
- Run Button → works without glitching on second click.
- Expenses → correctly negative regardless of CSV sign convention.

## 🔧 Troubleshooting

**`web-1 exited with code 1` during compose**
→ Make sure `smoke-backend.ps1` is not called in containerized environments (Windows-only).

**`relation "transactions" does not exist`**
→ Run migrations inside backend container:
```bash
docker exec -it <backend_container> alembic upgrade head
```

**Postgres first-run (alembic_version too short)**
→ The backend auto-widens `public.alembic_version.version_num` to `VARCHAR(64)` at startup. If you need to run it manually:
```powershell
$BE = (docker ps --format "{{.Names}}" | Select-String -Pattern "backend" | ForEach-Object { $_.ToString() })
docker exec -it $BE python -m app.scripts.fix_alembic_version
```

**Latest month looks wrong**
→ Check DB directly:
```bash
docker exec -it finance-pg psql -U myuser -d finance -c "SELECT MAX(date) FROM transactions;"
```

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
- `PLANNER_BYPASS=1` to bypass the planner LLM throttle in dev (root `dev.ps1` sets this automatically)

## Repo layout
```
apps/
  backend/   - FastAPI app (ingest, charts, insights, agent tools, tests)
  web/       - Vite/React web app (UI, charts, chat)
scripts/     - Windows helpers (dev, run-ollama)
docker-compose.yml
```

## Dev scripts (Windows)
- Top-level `dev.ps1` — launches backend (FastAPI) and frontend (Vite) in separate terminals.
  - Sets `APP_ENV=dev`, `DEV_ALLOW_NO_LLM=1`, and `PLANNER_BYPASS=1` for convenience.
  - Opens the Planner DevTool route in the browser (`/dev/plan`).
- `scripts/dev.ps1` — convenience runner that also starts Ollama and streams all logs in one window.
  - Parameters: `-Model gpt-oss:20b` (default), `-Py .venv/\Scripts/\python.exe` to point at your venv.
- `scripts/run-ollama.ps1` — ensures Ollama is running, pulls the model, and performs a quick generation test.
 - Top-level `prod.ps1` — build or preview a production-like setup. With `-Local`, serves the built app via `pnpm preview` and starts backend without Secure cookies; otherwise builds assets only.

Tip: In PowerShell, you may need to allow script execution for your repo path: `Set-ExecutionPolicy -Scope Process Bypass`.

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

## Dev-only features

- Planner DevTool (web): visible only in dev builds. Open the header Dev menu (wrench) → "Planner DevTool" or jump to `#dev-plan`. Lets you Plan or Plan & Run, shows tool traces and artifacts (PDF/Excel links, merchants), displays throttle status, and respects the bypass toggle.
- Dev menu (web header): shows live planner throttle tokens/rate with refresh, a persistent "Bypass planner throttle" checkbox, and quick links to backend Plan Debug and `/docs`.
- Backend endpoints (guarded): `GET /agent/plan/debug` and `GET /agent/plan/status` are available only when `APP_ENV=dev`. Responses include throttle info and echo the bypass flag.
- Dev env defaults: top‑level `dev.ps1` sets `APP_ENV=dev`, `DEV_ALLOW_NO_LLM=1`, and `PLANNER_BYPASS=1`, and opens the Planner DevTool route.
- Safety: these tools and routes are hidden in production builds.

## Dev-only: Planner debugger

GET `/agent/plan/debug`

Parameters:
- `q` (string): user text to plan
- `run` (bool, default false): execute the plan with deterministic tools
- `max_steps` (int, default 3): cap plan length
- `bypass` (bool, default false): bypass planner throttle (also honored when `PLANNER_BYPASS=1` is set on the backend)

Behavior:
- Hidden unless `APP_ENV=dev` (or `ENV=dev`). Returns 404 in non‑dev.
- When `run=false`: returns `{ ok, mode: "plan-only", plan }`.
- When `run=true`: returns `{ ok, mode: "executed", plan, tool_trace, artifacts, reply_preview }`.
- `reply_preview` appends PDF/Excel links when present.
- All responses include `throttle` metadata and echo the `bypass` flag.

Status endpoint:

GET `/agent/plan/status` → `{ ok, throttle }`
- Available in dev by default; to enable in any environment, set `ENABLE_PLAN_STATUS=1` on the backend.

Examples:

Plan only (no execution):

```bash
curl "http://127.0.0.1:8000/agent/plan/debug?q=Give%20me%20my%20top%20merchants%20for%20July%20and%20generate%20a%20PDF"
```

Execute plan (charts + report):

```bash
curl "http://127.0.0.1:8000/agent/plan/debug?q=top%20merchants%20for%20July%20and%20excel&run=1"

Bypass throttle in a single request:

```bash
curl "http://127.0.0.1:8000/agent/plan/debug?q=top%20merchants%20for%20July&bypass=1"
```

### Web Dev UI helpers
- Header includes a Dev menu with live planner throttle status and a persistent "Bypass planner throttle" toggle.
- The Planner DevTool panel (dev-only, at the bottom of the App) can Plan or Plan & Run, shows tool traces and artifacts, and respects the bypass toggle.
```

## Overlays & Insights (dev notes)

- Temporary budgets (`/budgets/temp`):
  - Overlays that do not persist to the DB. Process-level only.
  - Useful for “try it out” flows (e.g., Median + 25%).
  - If you want overlays to affect reads, merge them in the read path later.

- Anomaly ignores:
  - Global, process-level ignore set used by `/insights/anomalies`.
  - Not persisted; restarting the app resets it.
  - Persist later by backing with a table or simple on-disk store.

- Category chart semantics (`/charts/category`):
  - Returns monthly sums of expense magnitudes (only `amount < 0`, using `abs`).
  - Income/transfers are excluded from the series.

## Dev tips
- Windows PowerShell: activate venv with `.venv\Scripts\Activate.ps1`.
- Optional backend smoke check script lives under `apps/backend/app/scripts/smoke-backend.ps1` (used by the web smoke script).

## Maintainer: cleanup & verify
```powershell
cp .env.example .env
.\scripts\cleanup-working-tree.ps1
docker compose up -d --build
.\scripts\verify-demo-login.ps1
```

### History purge (if secrets were pushed earlier)
```powershell
python -m pip install git-filter-repo
.\scripts\history-purge.ps1
git fetch --all --prune
git reset --hard origin/main
git gc --prune=now --aggressive
```

## Why this will impress judges
- **Applies gpt-oss uniquely**: on-device, function-calling agent that explains its reasoning (“Explain Signal”) and learns from user feedback (train->reclassify loop).
- **Design**: clean UX, resilient states, deduped suggestions, one-click “Auto-apply best” with threshold.
- **Impact**: turns messy bank CSVs into actionable budgets & insights locally.
- **Novelty**: “Explain” turns category predictions into transparent traces (rules + LLM rationale).

## Agent Tools: Budget

### 1) Summary
\

### Friendly acknowledgements (ack)
Learning endpoints that change categorization or apply rules include a small acknowledgement payload for the UI:

ack: { "deterministic": "string", "llm": "string?", "mode": "deterministic|llm" }

The deterministic string is always present. When an LLM is available, a short polished sentence may be included and `mode` will be `llm`. The LLM path is best‑effort and safe to disable with DEV_ALLOW_NO_LLM=1.
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
