-- Backfill Top 50 Merchant Labels
-- Purpose: Give merchant majority labeler more coverage by ensuring top merchants have ≥3 labeled transactions
-- Safe: Only inserts where no label exists (idempotent)
-- Usage: psql -U $POSTGRES_USER -d $POSTGRES_DB -f backfill_merchant_labels.sql

-- Step 1: Identify top 50 merchants with their majority category label
-- (Requires at least 3 labels and p≥0.70 to be considered)
DROP TABLE IF EXISTS temp_top_merchants;
CREATE TEMP TABLE temp_top_merchants AS
WITH tx AS (
  SELECT merchant, id AS txn_id
  FROM transactions
  WHERE date >= CURRENT_DATE - INTERVAL '90 days'
    AND merchant IS NOT NULL
    AND merchant <> ''
),
counts AS (
  SELECT
    t.merchant,
    COALESCE(ul.category, tl.label) AS label,
    COUNT(*) AS c
  FROM tx t
  LEFT JOIN user_labels ul ON ul.txn_id = t.txn_id
  LEFT JOIN transaction_labels tl ON tl.txn_id = t.txn_id AND ul.txn_id IS NULL
  WHERE COALESCE(ul.category, tl.label) IS NOT NULL
  GROUP BY 1, 2
),
major AS (
  SELECT
    merchant,
    label,
    c,
    SUM(c) OVER (PARTITION BY merchant) AS total,
    ROW_NUMBER() OVER (PARTITION BY merchant ORDER BY c DESC) AS rk
  FROM counts
)
SELECT
  merchant,
  label,
  c AS support,
  total,
  (c::FLOAT / NULLIF(total, 0)) AS p
FROM major
WHERE rk = 1
  AND c >= 3  -- Minimum support
  AND (c::FLOAT / NULLIF(total, 0)) >= 0.70  -- Majority threshold
ORDER BY total DESC
LIMIT 50;

-- Review the candidates
SELECT
  merchant,
  label,
  support,
  total,
  ROUND(p::NUMERIC, 2) AS majority_p
FROM temp_top_merchants
ORDER BY total DESC;

-- Step 2: Backfill unlabeled transactions for these top merchants
-- (Limit to 1000 at a time to keep it incremental)
WITH targets AS (
  SELECT
    t.id AS txn_id,
    tm.label
  FROM transactions t
  INNER JOIN temp_top_merchants tm ON LOWER(t.merchant) = LOWER(tm.merchant)
  LEFT JOIN user_labels ul ON ul.txn_id = t.id
  LEFT JOIN transaction_labels tl ON tl.txn_id = t.id
  WHERE ul.txn_id IS NULL
    AND tl.txn_id IS NULL
    AND t.date >= CURRENT_DATE - INTERVAL '180 days'
  LIMIT 1000
)
INSERT INTO user_labels (txn_id, category)
SELECT txn_id, label
FROM targets
ON CONFLICT (txn_id) DO NOTHING;  -- Safety: Don't overwrite existing labels

-- Report results
SELECT
  'Backfilled' AS status,
  COUNT(*) AS new_labels
FROM user_labels
WHERE txn_id IN (
  SELECT t.id
  FROM transactions t
  INNER JOIN temp_top_merchants tm ON LOWER(t.merchant) = LOWER(tm.merchant)
  WHERE t.date >= CURRENT_DATE - INTERVAL '180 days'
);

-- Verification: Check merchant majority coverage after backfill
SELECT
  tm.merchant,
  tm.label AS expected_label,
  COUNT(ul.txn_id) AS labeled_count
FROM temp_top_merchants tm
INNER JOIN transactions t ON LOWER(t.merchant) = LOWER(tm.merchant)
LEFT JOIN user_labels ul ON ul.txn_id = t.id
WHERE t.date >= CURRENT_DATE - INTERVAL '180 days'
GROUP BY 1, 2
ORDER BY labeled_count DESC
LIMIT 20;

-- Cleanup
DROP TABLE IF EXISTS temp_top_merchants;

-- Next steps:
-- 1. Run this script incrementally (daily/weekly) to maintain coverage
-- 2. Schedule nightly ML training after backfill
-- 3. Monitor merchant majority hit rate in Grafana
