# Update — 2025-09-10

## ✳️ Recent updates (Sep 10, 2025)

Backend (deterministic routing + tools)
- Unified chat routing prioritizes deterministic tools before LLM, using a conservative detector:
  - services/agent_tools.py: added route_to_tool(...) to handle modes: nl_txns, charts.summary/flows/merchants/categories, report.link, budgets.read.
  - services/agent_detect.py (new): detect_txn_query(), infer_flow(), summarize_txn_result(), try_llm_rephrase_summary().
  - routers/agent.py: captures last user msg early; short-circuits to route_to_tool or nl_txns when detected; keeps LLM fallback.
- Charts and report links:
  - charts.* modes return normalized data via charts_data helpers.
  - report.link builds /report/excel or /report/pdf URLs with resolved filters.

Frontend (grounded UI + CSV in chat)
- AgentChat.tsx: shows a small “grounded” badge and a tool mode chip (Transactions/Charts/Report/Budgets) on deterministic replies.
- Inline “Download CSV” button appears when mode=nl_txns and intent=list. It calls txnsQueryCsv(q, filters) and saves the file (uses a small saveBlob helper).
- Renders filter chips (month/start/end/window/flow first, then others). Tooltip via title attributes.
- index.css: added .chat-badge-grounded styling.
- lib/api.ts: AgentChat types reflect optional mode/summary/rephrased/nlq.

Tests
- apps/backend/tests/:
  - test_agent_chat_routing.py: sanity check that generic prompts do not short-circuit; preserves requested model.
  - test_agent_chat_nl_txns.py: verifies NL txn queries short-circuit, return structured result and sensible totals.
  - test_agent_chat_tools.py: routes to tools (nl_txns/report.link) when appropriate.

Status
- Backend tests: PASS (with expected skips). Frontend build: PASS.
- Deterministic routing is conservative to avoid intercepting generic prompts.

Notes / next
- Optional: richer grounded renderers for charts in AgentChat.

---

<!-- Previous snapshot retained below -->

📸 Finance Agent Repo Snapshot (Copilot Dump)
✅ Checklist Coverage

- Frontend apps/web/src structure (components, UI primitives, index.css, tailwind config)
- Backend routers & services (rules, txns, ml, rules_service)
- api.ts exports & signatures
- RulesPanel.tsx signature/export
- docker-compose services & ports
- .env / config values for VITE_API_BASE and DB/API URLs

🖥 Frontend Structure (apps/web/src)

Root src
- api.ts (re-exports from lib/api)
- App.tsx
- index.css
- main.tsx
- styles.css
- context/, hooks/, lib/, state/, types/, utils/, vite-env.d.ts

lib/
- api.ts
- money.ts, scroll.ts, toast-helpers.ts, utils.ts

components/
- AgentChat.tsx
- AgentResultRenderers.tsx
- BudgetsPanel.tsx
- Card.tsx
- ChartsPanel.tsx
- ChatDock.tsx
- EmptyState.tsx
- ErrorBoundary.tsx
- InfoDot.tsx
- InsightsCard.tsx
- Providers.tsx
- ReportRangePanel.tsx
- RulesPanel.tsx
- RuleTesterPanel.tsx
- SuggestionsPanel.tsx
- Toast.tsx
- TopEmptyBanner.tsx
- UnknownsPanel.tsx
- UploadCsv.tsx

components/ui/
- dropdown-menu.tsx
- tooltip.tsx
- toast.tsx
- toaster.tsx

Styles
- index.css → HSL token theme + utility classes (global `.card` enforces `bg-card border border-border rounded-2xl`)
- tailwind.config.js → extends HSL colors; animate plugin

Focus Files
- RulesPanel.tsx, RuleTesterPanel.tsx, SuggestionsPanel.tsx, UnknownsPanel.tsx, UploadCsv.tsx, Card.tsx
- App.tsx (boot guard + health log)
- UI primitives (tooltip.tsx, dropdown-menu.tsx)

Recent updates (Sep 8, 2025)
- Card styling unified: Card enforces `bg-card border border-border rounded-2xl p-3`; headers use `border-b border-border pb-1` when title/right present.
- Panels wrapped with Card for consistency: RulesPanel, SuggestionsPanel, UploadCsv (UnknownsPanel and charts already used Card).
- App boot: month resolve runs once in an effect with `[]` deps and a ref guard; dashboards load in a separate effect depending only on `[month]`.
- Health: added `getHealthz()` client and one-time boot log `[db] <engine> loaded | alembic_ok=<...> | models_ok=<...>`.
- Backend `/healthz`: adds `db_engine`, `alembic_ok` (mirrors `alembic.in_sync`), and `models_ok` at top-level while keeping `db` and `alembic` objects.

⚙️ Backend Routers & Services

Routers (apps/backend/app/routers/):
- rules.py
- txns.py
- ml.py
- charts.py, ingest.py, alerts.py, budget.py, explain.py, health.py, insights.py, report.py

Services (apps/backend/app/services/):
- rules_service.py
- rules_engine.py
- rules_apply.py
- txns_service.py, tx_ops.js
- ingest_utils.py, ingest_csv.py
- ml_suggest.py, ml_train.py, ml_train_service.py
- insights_expanded.py, explain.py, recurring.py, context.py, llm.py

Highlights
- rules.py: list/create/delete rules, test rule, save-train-reclass
- txns.py: unknowns, categorize, transfer/splits/recurring
- ml.py: /ml/suggest cleaned output
- rules_service.py: maps input → ORM, persists rule with computed display_name

📡 API Exports (api.ts)

Core
- http<T>(path: string, init?: RequestInit): Promise<T>
- fetchJson(path: string, init?: RequestInit): Promise<any | null>

Health
- getHealthz(): Promise<any>

Charts
- getMonthSummary(month?: string)
- getMonthMerchants(month?: string)
- getMonthFlows(month?: string)
- getSpendingTrends(months = 6)

Budgets
- budgetCheck(month?: string)
- getBudgetCheck(month?: string)

Unknowns / Suggestions
- getUnknowns(month?: string): Promise<{ month: string|null; unknowns: any[] }>
- getSuggestions(month?: string): Promise<{ month?: string; suggestions: any[] }>

Rules
- type Rule = { id: number; name: string; enabled: boolean; when: object; then: { category?: string } }
- type RuleInput = Omit<Rule, 'id'|'created_at'|'updated_at'>
- type RuleListItem = { id: number; display_name: string; category?: string; active?: boolean }
- type GetRulesParams = { active?: boolean; q?: string; limit?: number; offset?: number }
- getRules(params?: GetRulesParams): Promise<{ items: RuleListItem[]; total: number; limit: number; offset: number }>
- listRules = getRules
- deleteRule(id: number): Promise<any>
- createRule(body: RuleInput): Promise<{ id: string; display_name: string }>
- testRule(payload: { rule: RuleInput; month?: string }): Promise<{ count: number; sample: any[]; month?: string }>

ML
- mlSuggest(month: string, limit=100, topk=3)
- mlTrain(month?: string, passes=1, min_samples=25)
- trainModel(params?: { min_samples?: number; test_size?: number })
- saveTrainReclassify(payload: { rule: RuleInput; month?: string })

Agent / Explain
- agentChat(...)
- getAgentModels()
- agentStatus()
- agentStatusOk()
- explainTxnForChat(txnId: string | number)

CSV ingest
- uploadCsv(file: File, replace = true, expensesArePositive?: boolean)

Txn ops
- reclassifyAll(month?: string)
- categorizeTxn(id: number, category: string)

📋 RulesPanel.tsx
- type Props = { month?: string; refreshKey?: number }
- export default React.memo<Props>(RulesPanelImpl)
- Uses shared Card wrapper; header uses `border-b border-border pb-1`.
- Search/pagination; create form submits via header button.

App boot and dashboards
- App resolves latest month once (ref-guarded effect with `[]` deps).
- Dashboards load in separate effect: `useEffect(() => { if (!month) return; /* load */ }, [month])`.

🐳 docker-compose.yml (services/ports)

backend
- build: apps/backend/Dockerfile
- ports: 8000:8000
- env: DATABASE_URL, OPENAI_BASE_URL=http://host.docker.internal:11434/v1, OPENAI_API_KEY=ollama, MODEL=gpt-oss:20b, DEV_ALLOW_NO_LLM=1
- command: uvicorn app.main:app --reload
- volumes: ./apps/backend:/app
- depends_on: postgres

web
- build: apps/web/Dockerfile
- ports: 5173:5173
- command: ["pnpm","dev","--host"]
- volumes: ./apps/web:/app

postgres
- image: postgres:16
- ports: 5432:5432
- env: POSTGRES_USER/PASSWORD/DB
- volume: finance-pgdata

🌐 Env / Config

Frontend
- apps/web/.env.local:
  - VITE_API_BASE=http://127.0.0.1:8000
- apps/web/src/lib/api.ts:
  - API_BASE = (import.meta as any)?.env?.VITE_API_BASE || (typeof window !== "undefined" && window.location?.port === "5173" ? "http://127.0.0.1:8000" : "");
  - getHealthz(): http('/healthz')

Backend
- apps/backend/.env.example:
  - DATABASE_URL=sqlite:///./data/finance.db
- config.py: defaults
update 📸 Finance Agent Snapshot — 2025-09-09

## 🔧 Backend

### New / Changed Files

* **requirements.txt**
  Added: `reportlab>=4.2.2`, `XlsxWriter>=3.2.0`

* **services/charts_data.py** (new)

  * Shared helpers: `get_month_summary`, `get_month_merchants`, `get_month_flows`, `get_spending_trends`
  * Optimized SQL GROUP BY for merchants & categories
  * New: `get_month_categories` (spend by category)
  * New: `resolve_window(month, start, end)` to unify month vs. custom ranges

* **services/report_export.py** (new)

  * **Excel (`build_excel_bytes`)**: Sheets → Summary, Categories, TopMerchants, Flows, Trends, Transactions (optionally split A–M/N–Z)
  * **PDF (`build_pdf_bytes`)**: Sections → Summary, Top Merchants, Top Categories, Flows line

* **routers/report.py** (extended)

  * Keeps legacy `/report`
  * Added:

    * `GET /report/excel` → XLSX (supports month, start/end, include_transactions, split_txns_alpha)
    * `GET /report/pdf` → PDF (supports month, start/end)
  * Auto-resolves latest month if no params
  * 404 if no data; 503 if ReportLab not installed
  * Filenames reflect month or range

* **routers/charts.py**

  * Refactored to only use `charts_data.py` helpers (no duplicated heuristics)

### Schema / DB

* **Feedback**: `created_at NOT NULL DEFAULT now()`, index `ix_feedback_created_at`
* **Transactions**: `merchant_canonical` + index; auto-sync via ORM validator
* **Scripts**: `recanonicalize_merchants.py` recomputes canonical merchant strings

---

## 🖥 Frontend

### New / Changed Files

* **lib/api.ts**

  * `downloadReportExcel(month?, includeTransactions?, {start,end,splitAlpha})`
  * `downloadReportPdf(month?, {start,end})`

* **utils/download.ts** (new)

  * `saveAs(blob, filename)` helper

* **components/ExportMenu.tsx** (new)

  * Dropdown menu: Export Excel / Export PDF
  * Toggles: Include transactions, Split A–M/N–Z
  * DateRangePicker rendered next to the dropdown (popover not nested)
  * Busy state + error handling

* **components/DateRangePicker.tsx** (new)

  * Popover with two `<input type="date">` fields + Apply / Clear
  * Validates order/format
  * Styled as pill trigger

### UI Niceties

* Export button + separate pill-styled range trigger with green dot
* Errors surface via toast/alert
* Buttons disable while busy
* Split toggle reflected in Excel sheet output

---

## 🧪 Tests

* **test_report_exports.py** → verifies Excel signature, PDF status (200 or 503)
* **test_report_options.py** → custom ranges, split_txns_alpha, include/exclude txns
* **test_charts_router_refactor.py** → endpoint keys/shapes, normalized positive spends

---

## 🚦 Functionality

* **Reports**

  * Excel: Summary, Categories, Merchants, Flows, Trends, Transactions (split optional)
  * PDF: Summary, Merchants, Categories, Flows
  * Range: `month=YYYY-MM` OR `start/end=YYYY-MM-DD`
  * Filenames respect range/month

* **Charts**

  * Endpoints: `/charts/month_summary`, `/month_merchants`, `/month_flows`, `/spending_trends`
  * All powered by `charts_data.py` (SQL-backed, normalized positive spends)

* **Frontend**

  * Export UI fully integrated
  * Custom range picker rendered outside the dropdown menu
  * Busy/error handling polished

* **CORS**

  * Configured for `localhost:5173` / `127.0.0.1:5173`
  * `Content-Disposition` exposed (download filenames preserved)

---

## � Repo Structure (relevant)

```
apps/backend/
  app/
    routers/
      charts.py
      report.py
      ...
    services/
      charts_data.py
      report_export.py
      ...
    scripts/
      recanonicalize_merchants.py
  requirements.txt
  tests/
    test_report_exports.py
    test_report_options.py
    test_charts_router_refactor.py

apps/web/
  src/
    lib/api.ts
    utils/download.ts
    components/
      ExportMenu.tsx
      DateRangePicker.tsx
    components/ui/
      dropdown-menu.tsx
      popover.tsx
```

---

✅ **Status:** Exports (Excel/PDF) fully working, with categories + custom ranges, split toggle, busy/error handling, polished UI. Tests all green.

---

## ✳️ Recent updates (Sep 11, 2025)

Auth & Web Security
- Switched to HttpOnly cookie auth end-to-end. Backend sets/reads `access_token` and `refresh_token` cookies; frontend uses `credentials: "include"` and stores no tokens.
- CSRF protection added via a minimal double-submit cookie:
  - Backend sets a non-HttpOnly `csrf_token` cookie on login/register/refresh and OAuth finalize.
  - Mutating routes (POST/PUT/PATCH/DELETE) now depend on `csrf_protect` which validates `X-CSRF-Token` against the cookie; GET routes stay CSRF-free.
  - CORS already allows `X-CSRF-Token` header; SameSite and Secure inherit from env.
- Frontend automatically sends `X-CSRF-Token` for unsafe methods and when calling `/auth/refresh` during a 401 auto-retry.

Frontend
- API helper (`apps/web/src/lib/api.ts`):
  - One-time 401 auto-refresh flow: on 401, POST `/auth/refresh` (cookies + CSRF), then re-issue the original request.
  - For POST/PUT/PATCH/DELETE, attach `X-CSRF-Token` from the `csrf_token` cookie when present.

Backend
- CSRF utils (`app/utils/csrf.py`): `issue_csrf_cookie(response)` and `csrf_protect` dependency.
- Auth routes: issue CSRF cookie on `/auth/login`, `/auth/register`, `/auth/refresh`, and OAuth callback finalize.
- Mutating endpoints protected with `Depends(csrf_protect)` across auth, rules, txns, ml, and budget routers. GET endpoints remain unchanged.
- CORS config: `allow_credentials=True` and `allow_headers` includes `Authorization`, `Content-Type`, `X-CSRF-Token`. Dev origins: `http://127.0.0.1:5173` and `http://localhost:5173`.

Explain endpoint (DB-backed)
- New: `GET /txns/{txn_id}/explain` returns a deterministic, SQL-backed explanation with optional LLM polish (`?use_llm=1`).
- Response: `{ txn, evidence, candidates, rationale, llm_rationale, mode, actions }`.
  - evidence includes `merchant_norm`, `rule_match`, `similar` (last 365 days; groups by canonical + base-token prefix), and `feedback` aggregates.
  - candidates are derived from rules/history (never `Unknown`).
  - rationale always includes `merchant_norm` and top historical category; `mode` is `deterministic` or `llm`.
- Caching: in-memory TTL (~10 min; `EXPLAIN_CACHE_TTL`), keyed by `(txn_id, sources signature, use_llm, model)`.
- LLM token bucket: ~30/min globally (`LLM_BUCKET_CAPACITY`), falls back to deterministic when depleted.
- DEV: `DEV_ALLOW_NO_LLM=1` forces deterministic mode; tests cover 200/404, evidence correctness, deterministic/LLM modes.

Dev/Prod Notes
- Dev uses `127.0.0.1` for both FE and BE so SameSite=Lax cookies work reliably.
- Production env switches:
  - `COOKIE_SECURE=1`
  - `COOKIE_SAMESITE=lax` (or `none` if truly cross-site over HTTPS)
  - `COOKIE_DOMAIN=your.app.domain`
  - `OAUTH_POST_LOGIN_REDIRECT=https://your.app.domain/app`

Status
- Backend and frontend updated; cookies and CSRF verified locally.
- Commits pushed on `Security-features` branch.