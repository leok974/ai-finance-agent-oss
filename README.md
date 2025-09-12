LedgerMind Ã¢‚¬€ AI Finance Agent (gpt-oss:20b)

Offline-first finance agent with local inference via Ollama or vLLM. Built for the Open Models Hackathon.

Agentic: function-calling tools for categorization, rules, budgets, insights, reports, and a new Planner.

Local: point to your local LLM (Ollama or vLLM) via env; your data never leaves your machine.

Explain Signal: transparent traces for category predictions (rules + LLM rationale).

Learns Fast: feedback Ã¢€ €™ train Ã¢€ €™ reclassify loop with incremental learning.

Natural Language: conversational transaction explanations Ã¢‚¬€ Ã¢‚¬Å“Explain this coffee charge.Ã¢‚¬

Production-grade: Pydantic validation, context trimming, PII redaction, CSRF + cookie auth, RBAC.

Performance: HTTP client reuse, token-aware prompts, deterministic tool routing with LLM fallback.

Design: clean UX, resilient state, deduped suggestions, one-click Auto-apply best with threshold.

Impact: turns messy bank CSVs into clear budgets & insights locally.

Novelty: grounded NLÃ¢€ €™SQL search + explain-why for every decision.

Ã¢Å“¨ WhatÃ¢‚¬„¢s New
Enhanced Agent Chat (Natural Language Explanations)

Ask questions without IDs Ã¢‚¬€ the agent detects and fetches relevant transactions.

# Before: explicit txn id
curl -X POST http://127.0.0.1:8000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Explain transaction 123"}], "intent":"explain_txn","txn_id":"123"}'

# Now: natural language
curl -X POST http://127.0.0.1:8000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Explain this $4.50 coffee charge"}], "intent":"explain_txn"}'


Key: smart fallback to find matches, intent-specific behavior, rich citations, privacy via PII redaction, robust validation.

Planner (Demo-ready)

Generates an actionable plan for the latest month:

Categorize top unknowns

Seed merchantÃ¢€ €™category rules

Suggest budget limits

One-click Export Excel/PDF

POST /agent/plan/preview Ã¢€ €™ plan items
POST /agent/plan/apply Ã¢€ €™ applies selected actions and returns a friendly ack

Ã°Å¸€“¥ Web UI (ChatDock)

Unified messages; persisted + cross-tab sync.

Export chat as JSON/Markdown.

Tool mode badges (Transactions/Charts/Report/Budgets).

Inline Download CSV when listing transactions.

Model picker (per-tab) Ã¢‚¬€ leave blank for backend default.

Quickstart
Prereqs

Python 3.11+

Node 20+ (pnpm recommended)

One local LLM:

Ollama: ollama run gpt-oss:20b

vLLM (OpenAI-compatible):
python -m vllm.entrypoints.openai.api_server --model <path-or-hf-id>

1) Configure env
cp .env.example .env
# set OPENAI_BASE_URL, OPENAI_API_KEY (e.g., 'ollama'), MODEL=gpt-oss:20b

2) Backend
cd apps/backend
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -U pip && pip install -e .
uvicorn app.main:app --reload --port 8000

3) Frontend
cd ../../apps/web
npm i -g pnpm || true
pnpm install
pnpm dev   # http://localhost:5173/app/

4) Load sample data

In the UI, open CSV Ingest and upload apps/backend/app/data/samples/transactions_sample.csv.

Ã°Å¸§  Agent Chat API (Types)
// apps/web/src/lib/api.ts
type AgentChatRequest = {
  messages: { role: 'system'|'user'|'assistant'; content: string }[];
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

Ã°Å¸€œÅ  Agent Tools & Reports
Charts (month required)

POST /charts/month_summary Ã¢€ €™ totals & net

POST /charts/month_merchants Ã¢€ €™ top spend by merchant

POST /charts/month_flows Ã¢€ €™ income vs spend

POST /charts/spending_trends Ã¢€ €™ multi-month trends

Reports

GET /report/excel Ã¢‚¬€ XLSX (optionally include transactions, split AÃ¢‚¬€œM/NÃ¢‚¬€œZ)

GET /report/pdf Ã¢‚¬€ PDF summary

Budgets

POST /agent/tools/budget/summary

POST /agent/tools/budget/check (pass category limits)

Unknowns & Rules

GET /txns/unknowns?month=YYYY-MM

POST /rules to seed merchant/category rules

Feedback loops feed incremental ML retraining

Ã°Å¸€ Security & Privacy

Local-first: point to your own LLM server via OPENAI_BASE_URL; no cloud required.

Cookie Auth + CSRF: HttpOnly access/refresh cookies; double-submit CSRF header on unsafe methods.

RBAC roles: admin, analyst, user.

PII redaction in logs; minimal telemetry.

Ã°Å¸³ Docker Compose (Dev)
docker compose down -v   # optional reset
docker compose up --build
# then run DB migrations inside backend container:
docker exec -it <backend> alembic upgrade head


CSV ingest (example):

curl.exe -X POST `
  -F "file=@C:\ai-finance-agent-oss\apps\backend\app\data\samples\transactions_sample.csv" `
  "http://127.0.0.1:8000/ingest?replace=true"

Ã¢Å“€¦ Expected Behavior

UI initializes to the latest month (auto-detected).

After CSV upload, dashboards refresh automatically.

NL queries route to deterministic tools when grounded; LLM fallback stays available.

Expenses normalized; charts use positive magnitudes for spend.

Ã°Å¸§ª Tests

Fast, hermetic test suite (no external keys).

Coverage includes agent chat routing, NLÃ¢€ €™SQL transactions, charts, reports, budgets, and planner smoke tests.

Run a subset:

cd apps/backend
.\.venv\Scripts\python.exe -m pytest -q tests/test_agent_chat_*.py

Ã°Å¸§© Troubleshooting

relation "transactions" does not exist Ã¢€ €™ run Alembic migrations.

CORS/CSRF Ã¢€ €™ ensure FE at http://127.0.0.1:5173, allow_credentials=True, and X-CSRF-Token header on unsafe methods.

LLM down Ã¢€ €™ set DEV_ALLOW_NO_LLM=1 to enable deterministic fallbacks.

Ã°Å¸§­ Project Story

I built LedgerMind because my parents taught me the importance of budgeting. Whenever they lent me money, they asked me to make a budget Ã¢‚¬€ and it became tedious fast, especially since I didnÃ¢‚¬„¢t know Excel well. I wanted something simple, private, and adaptive: a tool that learns my habits, explains why it makes decisions, and runs entirely on my machine. LedgerMind is that agent Ã¢‚¬€ private, transparent, and smarter with every click.

Why this will impress judges

Applies gpt-oss uniquely: on-device, function-calling agent with explain-why reasoning.

Grounded + Explainable: NLÃ¢€ €™SQL search + clear rationale for every decision.

Production touches: auth, CSRF, RBAC, robust tests, Dockerized dev.

Real utility: from CSV to charts, budgets, reports, and an actionable Planner Ã¢‚¬€ in minutes, fully local.