# AI Finance Agent (gpt-oss:20b)

Offline-first finance agent with local inference via Ollama or vLLM. Designed for the Open Models hackathon.
- **Agentic**: function-calling tools for categorization, rules, budgets, and insights
- **Local**: point to your local LLM server (Ollama or vLLM) via env
- **Safe UX**: optimistic UI, loading/error states, no duplicate suggestions, explain-why

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

## Month handling and data refresh
- The app initializes the UI month from your data automatically by calling the transactions search tool without a month; the backend returns the latest month it finds.
- Charts endpoints require an explicit `month`. The UI always passes it, and the Chat Dock auto-injects the current month for month-required tools.
- After a successful CSV upload, the app snaps the global month to the latest available and refreshes dashboards in the background (non-blocking).

## Environment
- `OPENAI_BASE_URL` (e.g. `http://localhost:11434/v1` for Ollama, or your vLLM URL)
- `OPENAI_API_KEY` (dummy like `ollama` for Ollama, or your real key for remote servers)
- `MODEL` (default `gpt-oss:20b`)
- `DEV_ALLOW_NO_LLM=1` to use deterministic stubbed suggestions if LLM is down

## Repo layout
```
apps/
  backend/  - FastAPI
  web/      - Vite/React
packages/
  shared/   - shared types
```

## Agent Chat
- Minimal chat is available in the web app (uses backend `POST /agent/chat`).
- Point `OPENAI_BASE_URL` and `OPENAI_API_KEY` to your local/remote LLM server; default model is `gpt-oss:20b`.

## Agent Tools: Insights and Charts

### Insights Summary
POST `/agent/tools/insights/summary`

Request (example):

```json
{ "month": "2025-08", "include_unknown_spend": true, "limit_large_txns": 10 }
```

Notes
- Legacy `/report` is removed. Use this Insights Summary tool instead.
- The UI’s `getReport` maps to this endpoint.

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
- **Applies gpt-oss uniquely**: on-device, function-calling agent that explains its reasoning (“Explain Signal”) and learns from user feedback (train->reclassify loop).
- **Design**: clean UX, resilient states, deduped suggestions, one-click “Auto-apply best” with threshold.
- **Impact**: turns messy bank CSVs into actionable budgets & insights locally.
- **Novelty**: “Explain” turns category predictions into transparent traces (rules + LLM rationale).

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
