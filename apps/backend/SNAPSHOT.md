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

## LLM help gating update (Sep 2025)
- Removed legacy `_llm_enabled` test shim from `describe` route.
- Added explicit env override `FORCE_HELP_LLM` (truthy/falsey) with highest precedence for help summary rephrase path.
- Documented `HELP_REPHRASE_DEFAULT` to control default rephrase behavior when query param omitted.

## Ops Health Snapshot (2025-09-26)
```
{
  "as_of": "2025-09-26T19:55:00Z",
  "project": "LedgerMind (prod)",
  "status": {
    "cloudflare": "ok",
    "tunnel": "ok",
    "nginx": "ok",
    "backend": "ok (healthy)"
  },
  "health": {
    "liveness": "/live -> 200 {ok:true}",
    "readiness": "/healthz -> {ok:true, reasons:[], info_reasons:[\"crypto_disabled\"], warn_reasons:[]}",
    "crypto_mode": "disabled",
    "alembic": {"in_sync": true, "migration_diverged": false},
    "version": {"branch": "Polish-clean-history", "commit": "2c50f2ce"}
  },
  "metrics": [
    "health_reason{reason, severity}",
    "alembic_multiple_heads",
    "crypto_* (mode/ready as gauges)"
  ],
  "probe_wiring": {
    "compose_healthcheck": "curl /live || curl /healthz",
    "nginx_upstream_probe": "/_up -> backend /live"
  },
  "strict_mode": {
    "env": "CRYPTO_STRICT_STARTUP",
    "behavior": "if true, crypto_disabled => degraded"
  }
}
```
