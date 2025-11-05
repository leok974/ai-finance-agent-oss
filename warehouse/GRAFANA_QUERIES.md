# Grafana Dashboard Queries for LedgerMind Warehouse

This document contains ready-to-use SQL queries for Grafana dashboards connected to the dbt warehouse.

## Connection Setup

### Postgres (Local/Staging)
- **Host:** localhost (or postgres container name)
- **Port:** 5432
- **Database:** finance
- **User:** myuser
- **Schema:** public

### BigQuery (Production)
- **Project:** ledgermind-ml-analytics
- **Dataset:** ledgermind
- **Authentication:** Service Account JSON

---

## Dashboard: Suggestions KPIs

### Panel 1: Daily Suggestion Volume (Time Series)

**Description:** Shows daily suggestion counts by mode (model vs heuristic)

**Postgres Query:**
```sql
SELECT 
  created_date AS time,
  suggestions AS "Total Suggestions",
  model_suggestions AS "Model Suggestions",
  heuristic_suggestions AS "Heuristic Suggestions",
  auto_suggestions AS "Auto Suggestions"
FROM public.mart_suggestions_daily
WHERE created_date >= CURRENT_DATE - INTERVAL '60 days'
ORDER BY created_date ASC
```

**BigQuery Query:**
```sql
SELECT 
  created_date AS time,
  suggestions AS total_suggestions,
  model_suggestions,
  heuristic_suggestions,
  auto_suggestions
FROM `ledgermind-ml-analytics.ledgermind.mart_suggestions_daily`
WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
ORDER BY created_date ASC
```

---

### Panel 2: 30-Day KPIs (Single Stat Panels)

**Description:** Summary metrics over last 30 days

**Postgres Query:**
```sql
SELECT 
  suggestions_30d AS "Total (30d)",
  model_suggestions_30d AS "Model (30d)",
  heur_suggestions_30d AS "Heuristic (30d)",
  auto_suggestions_30d AS "Auto (30d)"
FROM public.mart_suggestions_kpis
```

**BigQuery Query:**
```sql
SELECT 
  suggestions_30d,
  model_suggestions_30d,
  heur_suggestions_30d,
  auto_suggestions_30d
FROM `ledgermind-ml-analytics.ledgermind.mart_suggestions_kpis`
```

---

### Panel 3: Mode Distribution (Pie Chart)

**Description:** Percentage breakdown of suggestion modes

**Postgres Query:**
```sql
SELECT 
  'Model' AS mode,
  SUM(model_suggestions) AS count
FROM public.mart_suggestions_daily
WHERE created_date >= CURRENT_DATE - INTERVAL '30 days'
UNION ALL
SELECT 
  'Heuristic' AS mode,
  SUM(heuristic_suggestions) AS count
FROM public.mart_suggestions_daily
WHERE created_date >= CURRENT_DATE - INTERVAL '30 days'
UNION ALL
SELECT 
  'Auto' AS mode,
  SUM(auto_suggestions) AS count
FROM public.mart_suggestions_daily
WHERE created_date >= CURRENT_DATE - INTERVAL '30 days'
```

**BigQuery Query:**
```sql
SELECT 
  'Model' AS mode,
  SUM(model_suggestions) AS count
FROM `ledgermind-ml-analytics.ledgermind.mart_suggestions_daily`
WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
UNION ALL
SELECT 
  'Heuristic' AS mode,
  SUM(heuristic_suggestions) AS count
FROM `ledgermind-ml-analytics.ledgermind.mart_suggestions_daily`
WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
UNION ALL
SELECT 
  'Auto' AS mode,
  SUM(auto_suggestions) AS count
FROM `ledgermind-ml-analytics.ledgermind.mart_suggestions_daily`
WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
```

---

## Dashboard: Suggestions Feedback

### Panel 4: Daily Feedback Volume (Time Series)

**Description:** Feedback events over time with accept/reject breakdown

**Postgres Query:**
```sql
SELECT 
  created_date AS time,
  feedback_events AS "Total Feedback",
  accepts AS "Accepts",
  rejects AS "Rejects",
  undos AS "Undos"
FROM public.mart_suggestions_feedback_daily
WHERE created_date >= CURRENT_DATE - INTERVAL '60 days'
  AND feedback_events > 0
ORDER BY created_date ASC
```

**BigQuery Query:**
```sql
SELECT 
  created_date AS time,
  feedback_events,
  accepts,
  rejects,
  undos
FROM `ledgermind-ml-analytics.ledgermind.mart_suggestions_feedback_daily`
WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
  AND feedback_events > 0
ORDER BY created_date ASC
```

---

### Panel 5: Accept Rate Trend (Time Series)

**Description:** Daily acceptance rate percentage

**Postgres Query:**
```sql
SELECT 
  created_date AS time,
  accept_rate * 100 AS "Accept Rate %"
FROM public.mart_suggestions_feedback_daily
WHERE created_date >= CURRENT_DATE - INTERVAL '60 days'
  AND accept_rate IS NOT NULL
ORDER BY created_date ASC
```

**BigQuery Query:**
```sql
SELECT 
  created_date AS time,
  accept_rate * 100 AS accept_rate_pct
FROM `ledgermind-ml-analytics.ledgermind.mart_suggestions_feedback_daily`
WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
  AND accept_rate IS NOT NULL
ORDER BY created_date ASC
```

---

### Panel 6: Cumulative Feedback (Bar Gauge)

**Description:** Total feedback counts over last 30 days

**Postgres Query:**
```sql
SELECT 
  SUM(accepts) AS "Accepts",
  SUM(rejects) AS "Rejects",
  SUM(undos) AS "Undos"
FROM public.mart_suggestions_feedback_daily
WHERE created_date >= CURRENT_DATE - INTERVAL '30 days'
```

**BigQuery Query:**
```sql
SELECT 
  SUM(accepts) AS accepts,
  SUM(rejects) AS rejects,
  SUM(undos) AS undos
FROM `ledgermind-ml-analytics.ledgermind.mart_suggestions_feedback_daily`
WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
```

---

## Advanced Queries

### Query 7: Model Performance Comparison

**Description:** Compare accept rates across different models (when multiple models are deployed)

**Postgres Query:**
```sql
SELECT 
  model_id,
  AVG(accept_rate) * 100 AS avg_accept_rate_pct,
  SUM(feedback_events) AS total_feedback,
  SUM(accepts) AS total_accepts
FROM public.mart_suggestions_feedback_daily
WHERE created_date >= CURRENT_DATE - INTERVAL '30 days'
  AND accept_rate IS NOT NULL
GROUP BY model_id
ORDER BY avg_accept_rate_pct DESC
```

---

### Query 8: Daily Growth Rate

**Description:** Day-over-day change in suggestion volume

**Postgres Query:**
```sql
WITH daily AS (
  SELECT 
    created_date,
    suggestions,
    LAG(suggestions) OVER (ORDER BY created_date) AS prev_day_suggestions
  FROM public.mart_suggestions_daily
  WHERE created_date >= CURRENT_DATE - INTERVAL '60 days'
)
SELECT 
  created_date AS time,
  suggestions,
  CASE 
    WHEN prev_day_suggestions > 0 
    THEN ((suggestions - prev_day_suggestions)::FLOAT / prev_day_suggestions) * 100
    ELSE NULL
  END AS "Growth %"
FROM daily
ORDER BY created_date ASC
```

---

## Dashboard Variables

To make dashboards dynamic, create these Grafana template variables:

### Variable: `$days` (Days to look back)
**Type:** Custom  
**Values:** `7,14,30,60,90`  
**Default:** `30`

**Usage in queries:**
```sql
-- Postgres
WHERE created_date >= CURRENT_DATE - INTERVAL '$days days'

-- BigQuery
WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL $days DAY)
```

### Variable: `$model_id` (Filter by model)
**Type:** Query  
**Query (Postgres):**
```sql
SELECT DISTINCT model_id 
FROM public.mart_suggestions_daily 
ORDER BY model_id
```

**Usage in queries:**
```sql
WHERE model_id = '$model_id'
```

---

## Alerting Rules

### Alert 1: Low Accept Rate
**Condition:** Accept rate drops below 40% for 3 consecutive days  
**Query:**
```sql
SELECT AVG(accept_rate) 
FROM public.mart_suggestions_feedback_daily
WHERE created_date >= CURRENT_DATE - INTERVAL '3 days'
```

### Alert 2: Zero Suggestions
**Condition:** No suggestions generated for current day  
**Query:**
```sql
SELECT COALESCE(SUM(suggestions), 0) 
FROM public.mart_suggestions_daily
WHERE created_date = CURRENT_DATE
```

---

## Dashboard JSON Export

To create a complete dashboard:

1. Import queries above into Grafana panels
2. Set time range to "Last 60 days"
3. Enable auto-refresh (1-5 minutes)
4. Export as JSON for version control
5. Store in `ops/grafana/dashboards/ledgermind-suggestions.json`

---

**Last Updated:** 2025-11-04  
**Maintained By:** LedgerMind Ops (leoklemet.pa@gmail.com)
