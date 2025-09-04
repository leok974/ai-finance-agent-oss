# Snapshot — Ai Finance Agent (backend)
_Date: 2025-09-04_

## Core fixes
- Unified ORM in `app/orm_models.py`; `Base` provided by `app.db`.
- Alembic wired with a valid `SQLALCHEMY_DATABASE_URL`; migrations run clean.
- ML suggest flow stabilized; unlabeled semantics = `None` / `""` / `"Unknown"` (case-insensitive).

## New agent tool routers (mounted in `app/main.py`)
- **Transactions** (`app/routers/agent_tools_transactions.py`)
  - `POST /agent/tools/transactions/search`
  - `POST /agent/tools/transactions/categorize`
  - `POST /agent/tools/transactions/get_by_ids`

- **Budget** (`app/routers/agent_tools_budget.py`)
  - `POST /agent/tools/budget/summary`
  - `POST /agent/tools/budget/check` (utilization JSON-safe; no `inf`)

- **Insights** (`app/routers/agent_tools_insights.py`)
  - `POST /agent/tools/insights/summary` (summary, unknown spend, top categories/merchants, large txns)

- **Charts** (`app/routers/agent_tools_charts.py`)
  - `POST /agent/tools/charts/summary`
  - `POST /agent/tools/charts/merchants`
  - `POST /agent/tools/charts/flows`
  - `POST /agent/tools/charts/spending_trends`

- **Rules** (`app/routers/agent_tools_rules.py`)
  - `POST /agent/tools/rules/test`
  - `POST /agent/tools/rules/apply` (bulk label only unlabeled matches)

## Tests (all green locally)
- `tests/test_agent_tools_transactions.py`
- `tests/test_agent_tools_budget.py` (relaxed CSV category assumption; utilization capped)
- `tests/test_agent_tools_insights.py`
- `tests/test_agent_tools_charts.py`
- `tests/test_agent_tools_rules.py`

## Pytest markers (`pytest.ini`)
- `agent_tools`, `budget`, `insights`, `charts`, `rules`
- Each test file tagged appropriately for selective runs.

## Docs
- `app/routers/agent_tools/README.md` covers Transactions, Budget, Insights, Charts, markers & commands.

## Contract guarantees
- **Unlabeled** detection standardized.
- **Budget** utilization never returns Infinity (JSON-safe).
- All endpoints emit stable, agent-friendly JSON.

## Next steps
- Frontend ChatDock: wire tool calls + loading/error states.
- Optional **Rules CRUD** persistence (table + list/create/update/delete).
- Expanded insights (month-over-month diffs, anomaly flags) + rule suggestions.
- Optional CI lane: `pytest -m agent_tools` for fast feedback.
