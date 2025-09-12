# Agent Tools

This directory contains HTTP endpoints exposed for agent-friendly operat- `-m insights` → run only insights agent tool tests (expanded insights)

### Examples

Run just **expanded insights** tests:

```powershell
cd apps/backend
..\.venv\Scripts\python.exe -m pytest -m insights -q
```ch, categorize, budgets, insights, etc.).

## Agent Tools: Insights

⚠️ **Deprecated**: POST `/agent/tools/insights/summary` is deprecated. Use `/expanded` instead.

### Expanded Insights (MoM + anomalies)

POST `/agent/tools/insights/expanded`

Request:

```json
{
  "month": "2025-08",
  "large_limit": 10
}
```

Response shape:

```json
{
  "month": "2025-08",
  "prev_month": "2025-07",
  "summary": {
    "income": 5000.0,
    "spend": -645.49,
    "net": 4354.51
  },
  "mom": {
    "income": {"prev": 4800.0, "curr": 5000.0, "delta": 200.0, "pct": 0.042},
    "spend": {"prev": -580.0, "curr": -645.49, "delta": -65.49, "pct": 0.113},
    "net": {"prev": 4220.0, "curr": 4354.51, "delta": 134.51, "pct": 0.032}
  },
  "top_categories": [
    {"category": "Travel", "amount": -400.0},
    {"category": "Groceries", "amount": -120.0}
  ],
  "top_merchants": [
    {"merchant": "Delta", "amount": -400.0},
    {"merchant": "Costco", "amount": -120.0}
  ],
  "large_transactions": [
    {
      "id": 5,
      "date": "2025-08-05",
      "merchant": "Delta",
      "category": "Travel",
      "amount": -400.0
    }
  ],
  "unknown_spend": {
    "amount": -230.5,
    "count": 3
  },
  "anomalies": {
    "categories": [
      {"key": "Dining", "prev": 120.0, "curr": 280.0, "delta": 160.0, "pct": 1.33}
    ],
    "merchants": [
      {"key": "Restaurant Co", "prev": 0.0, "curr": 180.0, "delta": 180.0, "pct": null}
    ]
  }
}
```

---

## 4) Run expanded insights tests

```powershell
cd apps/backend
.\.venv\Scripts\python.exe -m pytest -q tests/test_agent_tools_insights.py::test_insights_expanded --maxfail=1
```

Note: The summary endpoint tests are deprecated and skipped.

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
