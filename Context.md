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
 (See <attachments> above for file contents. You may not need to search or read the file again.)