# Agent Tools

This directory contains HTTP endpoints exposed for agent-friendly operations (search, categorize, budgets, insights, etc.).

## Agent Tools: Insights

POST `/agent/tools/insights/summary`

Request:

```json
{
  "month": "2025-08",
  "top_n": 3,
  "large_txn_threshold": 200.0,
  "include_unknown": true
}
```

Response shape:

```json
{
  "month": "2025-08",
  "insights": [
    {
      "id": "summary",
      "kind": "summary",
      "title": "Summary for 2025-08",
      "detail": "Inflows $..., outflows $..., net $...",
      "severity": "info",
      "metrics": {"inflows": 0, "outflows": 0, "net": 0, "unknown_count": 0}
    },
    {
      "id": "unknown-spend",
      "kind": "unknown_spend",
      "title": "Uncategorized/Unknown spending detected",
      "detail": "You have $X.YZ of spend without a category...",
      "severity": "warn",
      "metrics": {"unknown_spend": 123.45}
    },
    {
      "id": "top-categories",
      "kind": "top_categories",
      "title": "Top N categories by spend",
      "detail": "Groceries: $..., Transport: $..., ...",
      "severity": "info",
      "metrics": {"items": [{"category":"Groceries","spend":...}, ...]}
    },
    {
      "id": "top-merchants",
      "kind": "top_merchants",
      "title": "Top N merchants by spend",
      "detail": "Costco: $..., Uber: $..., ...",
      "severity": "info",
      "metrics": {"items": [{"merchant":"Costco","spend":...}, ...]}
    },
    {
      "id": "large-transactions",
      "kind": "large_transaction",
      "title": "K large transaction(s) ≥ $T",
      "detail": "Merchant $Amount on YYYY-MM-DD; ...",
      "severity": "warn",
      "metrics": {"threshold": 200.0, "items":[{"id":1,"date":"...","merchant":"...", "amount":-400.0, "category":"..."}]}
    }
  ]
}
```

---

## 4) Run just these tests

```powershell
cd apps/backend
.\.venv\Scripts\python.exe -m pytest -q tests/test_agent_tools_insights.py --maxfail=1
```

---

## 🔖 Pytest Markers

Each agent tool group has its own pytest marker so you can run tests selectively:

- `-m agent_tools` → run all agent tool tests (transactions, budget, insights, charts, etc.)
- `-m budget` → run only budget agent tool tests
- `-m insights` → run only insights agent tool tests
- `-m charts` → run only charts agent tool tests

### Examples

Run just **insights** tests:

```powershell
cd apps/backend
..\.venv\Scripts\python.exe -m pytest -m insights -q
```

## Agent Tools: Rules

### Test a rule
**POST** `/agent/tools/rules/test`

Request:

```json
{ "pattern": "uber", "target": "merchant", "category": "Transport", "month": "2025-08", "limit": 100 }
```

Response:

```json
{ "month": "2025-08", "total_hits": 2, "sample": [ { "id": 1, "merchant": "Uber" } ], "candidate_category": "Transport", "rule": {"pattern":"uber","target":"merchant"} }
```

### Apply a rule (bulk-categorize matches)

**POST** `/agent/tools/rules/apply`

Request:

```json
{ "pattern": "uber", "target": "merchant", "category": "Transport", "month": "2025-08", "limit": 100 }
```

Response:

```json
{ "month": "2025-08", "matched_ids": [1,2], "updated": 2, "category": "Transport", "rule": {"pattern":"uber","target":"merchant"} }
```

Notes:

- Matches are case-insensitive substring on the chosen target.
- Apply only updates unlabeled rows (NULL, empty, or "Unknown").
- Use test first to preview hits; then apply to bulk label.

---

If you later want a “real” rule persistence endpoint (create/list/delete in a `rules` table), we can extend this router to write to your existing `/rules` or a dedicated ORM model. For now, this gives the agent a safe, deterministic loop: test → apply → verify.
