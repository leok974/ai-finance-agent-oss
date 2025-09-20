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
