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
- health.py (/healthz):
  - status: "ok" | "degraded"
  - db: { reachable: boolean, models_ok: boolean }
  - alembic: { db_revision, code_head, in_sync }
  - db_engine: string (backend+driver)
  - alembic_ok: boolean (same as alembic.in_sync)
  - models_ok: boolean (top-level convenience)
📸 Finance Agent Repo Snapshot (Copilot Dump)
✅ Checklist Coverage

 Frontend apps/web/src structure (components, UI primitives, index.css, tailwind config)

 Backend routers & services (rules, txns, ml, rules_service)

 api.ts exports & signatures

 RulesPanel.tsx signature/export

 docker-compose services & ports

 .env / config values for VITE_API_BASE and DB/API URLs

🖥 Frontend Structure (apps/web/src)

Root src

api.ts (re-exports from lib/api)

App.tsx

index.css

main.tsx

styles.css

context/, hooks/, lib/, state/, types/, utils/, vite-env.d.ts

lib/

api.ts

money.ts, scroll.ts, toast-helpers.ts, utils.ts

components/

AgentChat.tsx

AgentResultRenderers.tsx

BudgetsPanel.tsx

Card.tsx

ChartsPanel.tsx

ChatDock.tsx

EmptyState.tsx

ErrorBoundary.tsx

InfoDot.tsx

InsightsCard.tsx

Providers.tsx

ReportRangePanel.tsx

RulesPanel.tsx

RuleTesterPanel.tsx

SuggestionsPanel.tsx

Toast.tsx

TopEmptyBanner.tsx

UnknownsPanel.tsx

UploadCsv.tsx

components/ui/

dropdown-menu.tsx

tooltip.tsx

toast.tsx

toaster.tsx

Styles

index.css → HSL token theme + utility classes

tailwind.config.js → extends HSL colors; animate plugin

Focus Files

RulesPanel.tsx, RuleTesterPanel.tsx, SuggestionsPanel.tsx, UnknownsPanel.tsx, Card.tsx

UI primitives (tooltip.tsx, dropdown-menu.tsx)

⚙️ Backend Routers & Services

Routers (apps/backend/app/routers/):

rules.py

txns.py

ml.py

others: charts.py, ingest.py, alerts.py, budget.py, explain.py, health.py, insights.py, report.py

Services (apps/backend/app/services/):

rules_service.py

rules_engine.py

rules_apply.py

txns_service.py, tx_ops.js

ingest_utils.py, ingest_csv.py

ml_suggest.py, ml_train.py, ml_train_service.py

insights_expanded.py, explain.py, recurring.py, context.py, llm.py

Highlights

rules.py: list/create/delete rules, test rule, save-train-reclass

txns.py: unknowns, categorize, transfer/splits/recurring

ml.py: /ml/suggest cleaned output

rules_service.py: maps input → ORM, persists rule with computed display_name

📡 API Exports (api.ts)

Core

http<T>(path: string, init?: RequestInit): Promise<T>
fetchJson(path: string, init?: RequestInit): Promise<any | null>


Charts

getMonthSummary(month?: string)

getMonthMerchants(month?: string)

getMonthFlows(month?: string)

getSpendingTrends(months = 6)

Budgets

budgetCheck(month?: string)

getBudgetCheck(month?: string)

Unknowns / Suggestions

getUnknowns(month?: string): Promise<{ month: string|null; unknowns: any[] }>

getSuggestions(month?: string): Promise<{ month?: string; suggestions: any[] }>

Rules

type Rule = { id: number; name: string; enabled: boolean; when: object; then: { category?: string } }
type RuleInput = Omit<Rule, 'id'|'created_at'|'updated_at'>
type RuleListItem = { id: number; display_name: string; category?: string; active?: boolean }
type GetRulesParams = { active?: boolean; q?: string; limit?: number; offset?: number }

getRules(params?: GetRulesParams): Promise<{ items: RuleListItem[]; total: number; limit: number; offset: number }>
listRules = getRules
deleteRule(id: number): Promise<any>
createRule(body: RuleInput): Promise<{ id: string; display_name: string }>
testRule(payload: { rule: RuleInput; month?: string }): Promise<{ count: number; sample: any[]; month?: string }>


ML

mlSuggest(month: string, limit=100, topk=3)

mlTrain(month?: string, passes=1, min_samples=25)

trainModel(params?: { min_samples?: number; test_size?: number })

saveTrainReclassify(payload: { rule: RuleInput; month?: string })

Agent / Explain

agentChat(...)

getAgentModels()

agentStatus()

agentStatusOk()

explainTxnForChat(txnId: string | number)

CSV ingest

uploadCsv(file: File, replace = true, expensesArePositive?: boolean)

Txn ops

reclassifyAll(month?: string)

categorizeTxn(id: number, category: string)

📋 RulesPanel.tsx
type Props = { refreshKey?: number }
export default function RulesPanel({ refreshKey }: Props) { ... }


Only refreshKey prop declared.

Not wrapped in memo or forwardRef.

🐳 docker-compose.yml (services/ports)

backend

build: apps/backend/Dockerfile

ports: 8000:8000

env: DATABASE_URL=postgresql+psycopg://myuser:mypassword@postgres:5432/finance

command: uvicorn app.main:app --reload

volumes: ./apps/backend:/app

depends_on: postgres

web

build: apps/web/Dockerfile

ports: 5173:5173

command: ["pnpm","dev","--host"]

volumes: ./apps/web:/app

postgres

image: postgres:16

ports: 5432:5432

env: POSTGRES_USER/PASSWORD/DB

volume: finance-pgdata

🌐 Env / Config

Frontend

apps/web/.env.local:

VITE_API_BASE=http://127.0.0.1:8000


apps/web/src/lib/api.ts:

API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";


Backend

apps/backend/.env.example:

DATABASE_URL=sqlite:///./data/finance.db
# or: postgresql+psycopg://finance:finance@localhost:5432/finance


config.py: defaults

DB: sqlite

---

## 📸 Finance Agent Snapshot (2025-09-09, with Incremental Learning)

### 🧠 Incremental Learning Milestone
- **Backend**
  - New endpoint: `/ml/feedback` → accepts real txn ids, applies `partial_fit` to the active model.
  - `/ml/selftest` → verifies update worked by bumping model mtime.
  - `ml_train_service.py` → persists `latest.joblib` after partial fits.
  - Unknowns endpoint now returns real DB ids (not just UI fake ids).
  - Schema includes `transactions` + new `feedback` table.

- **Frontend**
  - **MLStatusCard**: polls `/ml/status` (guarded) and coalesces refreshes.
  - **ChatDock**:
    - Undo snackbar (snapshot old messages → clear → Undo restores).
    - Badges: `LearnedBadge` (after feedback applied), `RestoredBadge` (after undo).
    - Thinking indicator bubble.
  - **Refresh Bus**: debounce + coalesced refresh across panels after successive applies.
  - **Toasts**: animated exit (`animate-fade-slide-up`).
  - API helpers added: `mlSelftest`, `getMlStatus`, `mlFeedback`.

### 🔑 What this enables
- Users can **teach the model interactively** by reclassifying suggestions → feedback → partial_fit.
- Model updates incrementally without a full retrain.
- UI reflects learning (badges, undo, toasts).
- Dev overlay: **NetActivityBlip** shows color/intensity per update.